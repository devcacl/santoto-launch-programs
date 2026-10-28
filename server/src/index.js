import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { pool, initializeDatabase } from './db.js';
import { requireAdmin, signSession, verifySession } from './security.js';

const app = express();
const config = JSON.parse(await readFile(new URL('./config/event.json', import.meta.url), 'utf8'));
const port = Number(process.env.PORT || 3001);
const cookieName = 'santoto_session';
const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.APP_ORIGIN || 'http://localhost:5173', credentials: true, methods: ['GET', 'POST', 'PATCH'] }));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api/auth/register', rateLimit({ windowMs: 15 * 60_000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false }));

const registrationSchema = z.object({
  firstName: z.string().trim().min(2).max(80).regex(/^[\p{L}\p{M}][\p{L}\p{M}\s'.-]+$/u),
  lastName: z.string().trim().min(2).max(100).regex(/^[\p{L}\p{M}][\p{L}\p{M}\s'.-]+$/u),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(32).optional().default('').refine((value) => !value || /^\+?[0-9\s()\-]{7,20}$/.test(value)),
  school: z.string().trim().max(140).optional().default(''),
  city: z.string().trim().max(100).optional().default(''),
  consentPrivacy: z.literal(true),
  consentMarketing: z.boolean().default(false),
});

function participantId(req) { return verifySession(req.cookies[cookieName]); }
async function requireParticipant(req, res, next) {
  const id = participantId(req);
  if (!id) return res.status(401).json({ error: 'Regístrate para guardar tu recorrido.' });
  try {
    const { rows } = await pool.query('SELECT id FROM participants WHERE id = $1', [id]);
    if (!rows.length) return res.status(401).json({ error: 'La sesión ya no está activa.' });
    req.participantId = id;
    next();
  } catch (error) { next(error); }
}

async function getProgress(id) {
  const [challenges, talks] = await Promise.all([
    pool.query('SELECT program_id, challenge_id, answer_index, completed_at FROM challenge_completions WHERE participant_id = $1', [id]),
    pool.query('SELECT talk_id, checked_in_at FROM talk_attendance WHERE participant_id = $1', [id]),
  ]);
  const completedChallenges = challenges.rows;
  const completedTalks = talks.rows;
  const programBadges = config.programs.filter((program) => program.challenges.every((challenge) => completedChallenges.some((row) => row.program_id === program.id && row.challenge_id === challenge.id)));
  const auditoriumBadge = config.talks.length > 0 && config.talks.every((talk) => completedTalks.some((row) => row.talk_id === talk.id));
  const coins = completedChallenges.length * config.gamification.coinsPerChallenge
    + completedTalks.length * config.gamification.coinsPerTalk
    + programBadges.length * config.gamification.coinsPerBadge
    + (auditoriumBadge ? config.gamification.coinsPerAuditoriumBadge : 0);
  return { challenges: completedChallenges, talks: completedTalks, coins, badges: [...programBadges.map((program) => program.id), ...(auditoriumBadge ? ['auditorium'] : [])] };
}

function validChallengeAnswer(challenge, rawAnswer) {
  const rules = challenge.rules || {};
  const items = challenge.items || [];
  const knownIds = new Set(items.map((item) => item.id));
  if (challenge.type === 'builder' || challenge.type === 'market') {
    const parsed = z.array(z.string().max(60)).min(1).max(items.length).safeParse(rawAnswer);
    if (!parsed.success || new Set(parsed.data).size !== parsed.data.length || parsed.data.some((id) => !knownIds.has(id))) return false;
    const selected = parsed.data.map((id) => items.find((item) => item.id === id));
    if (selected.length < rules.minItems || (rules.maxItems && selected.length > rules.maxItems)) return false;
    if (rules.requiredGroups && !rules.requiredGroups.every((group) => selected.some((item) => item.group === group))) return false;
    if (challenge.type === 'market') {
      const total = selected.reduce((sum, item) => sum + item.cost, 0);
      if (total > rules.budget) return false;
    }
    return true;
  }
  if (challenge.type === 'sequence') {
    const parsed = z.array(z.string().max(60)).length(items.length).safeParse(rawAnswer);
    return parsed.success && parsed.data.every((id, index) => id === rules.expectedOrder[index]);
  }
  if (challenge.type === 'detective') {
    return typeof rawAnswer === 'string' && items.some((item) => item.id === rawAnswer) && rawAnswer === rules.answerId;
  }
  if (challenge.type === 'allocation') {
    const parsed = z.record(z.string().max(60), z.number().int().min(0).max(rules.maxPerBucket)).safeParse(rawAnswer);
    if (!parsed.success) return false;
    const ids = challenge.buckets.map((bucket) => bucket.id);
    if (Object.keys(parsed.data).length !== ids.length || ids.some((id) => !(id in parsed.data))) return false;
    const total = Object.values(parsed.data).reduce((sum, value) => sum + value, 0);
    return total === rules.total && Object.entries(rules.minByBucket).every(([id, minimum]) => parsed.data[id] >= minimum);
  }
  if (challenge.type === 'headline') {
    return typeof rawAnswer === 'string' && rawAnswer === rules.headline;
  }
  return false;
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/event', (_req, res) => {
  const event = structuredClone(config);
  event.programs = event.programs.map((program) => ({
    ...program,
    challenges: program.challenges.map(({ rules, ...challenge }) => challenge),
  }));
  res.json({ event });
});

app.post('/api/auth/register', async (req, res, next) => {
  const parsed = registrationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Revisa los campos requeridos y la autorización de datos.' });
  const input = parsed.data;
  const email = input.email.toLowerCase();
  try {
    const id = randomUUID();
    const inserted = await pool.query(`INSERT INTO participants (id, first_name, last_name, email, phone, school, city, consent_privacy, consent_marketing)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (email) DO NOTHING RETURNING id`,
    [id, input.firstName, input.lastName, email, input.phone || null, input.school || null, input.city || null, input.consentPrivacy, input.consentMarketing]);
    if (!inserted.rowCount) return res.status(409).json({ error: 'Este correo ya tiene un recorrido asociado. Continúa desde el dispositivo donde te registraste o solicita apoyo al equipo del evento.' });
    res.cookie(cookieName, signSession(id), { httpOnly: true, secure: process.env.COOKIE_SECURE === 'true' || isProduction, sameSite: 'lax', maxAge: 14 * 24 * 60 * 60 * 1000, path: '/' });
    const { rows } = await pool.query('SELECT id, first_name, last_name, preferred_program FROM participants WHERE id=$1', [id]);
    res.json({ participant: rows[0], progress: await getProgress(id) });
  } catch (error) { next(error); }
});

app.get('/api/me', requireParticipant, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, first_name, last_name, preferred_program FROM participants WHERE id=$1', [req.participantId]);
    res.json({ participant: rows[0], progress: await getProgress(req.participantId) });
  } catch (error) { next(error); }
});

app.post('/api/challenges/:programId/:challengeId/complete', requireParticipant, async (req, res, next) => {
  const { programId, challengeId } = req.params;
  const programIndex = config.programs.findIndex((program) => program.id === programId);
  const program = config.programs[programIndex];
  const challengeIndex = program?.challenges.findIndex((challenge) => challenge.id === challengeId) ?? -1;
  const challenge = program?.challenges[challengeIndex];
  if (!challenge || !Object.hasOwn(req.body || {}, 'answer')) return res.status(400).json({ error: 'Este reto no está disponible.' });
  if (!validChallengeAnswer(challenge, req.body.answer)) return res.status(422).json({ error: 'Todavía falta completar una parte de la misión. Revisa tu combinación e inténtalo de nuevo.' });
  try {
    if (challengeIndex > 0) {
      const previous = program.challenges[challengeIndex - 1];
      const result = await pool.query('SELECT 1 FROM challenge_completions WHERE participant_id=$1 AND program_id=$2 AND challenge_id=$3', [req.participantId, programId, previous.id]);
      if (!result.rowCount) return res.status(409).json({ error: 'Completa el reto anterior para continuar.' });
    }
    const before = await getProgress(req.participantId);
    const inserted = await pool.query(`INSERT INTO challenge_completions (participant_id, program_id, challenge_id, answer_index, answer_json)
      VALUES ($1,$2,$3,0,$4::jsonb) ON CONFLICT (participant_id, program_id, challenge_id) DO NOTHING RETURNING challenge_id`, [req.participantId, programId, challengeId, JSON.stringify(req.body.answer)]);
    const progress = await getProgress(req.participantId);
    const badgeEarned = program.challenges.every((item) => progress.challenges.some((row) => row.program_id === programId && row.challenge_id === item.id));
    const earnedProgramBadge = badgeEarned && !before.badges.includes(programId);
    const coinsAwarded = inserted.rowCount ? config.gamification.coinsPerChallenge + (earnedProgramBadge ? config.gamification.coinsPerBadge : 0) : 0;
    res.json({ success: true, feedback: challenge.feedback, badgeEarned, coinsAwarded, progress });
  } catch (error) { next(error); }
});

app.post('/api/talks/:talkId/check-in', requireParticipant, async (req, res, next) => {
  const talk = config.talks.find((item) => item.id === req.params.talkId);
  if (!talk) return res.status(404).json({ error: 'Charla no encontrada.' });
  try {
    const participantProgress = await getProgress(req.participantId);
    const standsComplete = config.programs.every((program) => program.challenges.every((challenge) => participantProgress.challenges.some((row) => row.program_id === program.id && row.challenge_id === challenge.id)));
    if (!standsComplete) return res.status(409).json({ error: 'Completa las dos misiones de los stands antes de registrar tu pasaporte de charlas.' });
    let checkInCodes = {};
    try { checkInCodes = JSON.parse(process.env.AUDITORIUM_CHECKIN_CODES || '{}'); } catch { return res.status(503).json({ error: 'El registro de charlas no está configurado.' }); }
    if (!checkInCodes[talk.id] || req.body?.code !== checkInCodes[talk.id]) return res.status(403).json({ error: 'Ese código no corresponde a esta charla. Pídele a Tommy la pista correcta.' });
    const before = await getProgress(req.participantId);
    const inserted = await pool.query('INSERT INTO talk_attendance (participant_id, talk_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING talk_id', [req.participantId, talk.id]);
    const nextProgress = await getProgress(req.participantId);
    const earnedAuditoriumBadge = nextProgress.badges.includes('auditorium') && !before.badges.includes('auditorium');
    const coinsAwarded = inserted.rowCount ? config.gamification.coinsPerTalk + (earnedAuditoriumBadge ? config.gamification.coinsPerAuditoriumBadge : 0) : 0;
    res.json({ success: true, coinsAwarded, progress: nextProgress });
  } catch (error) { next(error); }
});

app.patch('/api/me/preference', requireParticipant, async (req, res, next) => {
  const program = z.string().max(160).safeParse(req.body?.program);
  const allowed = new Set([...config.programs.map((item) => item.name), ...config.otherPrograms, 'Aún no lo sé']);
  if (!program.success || !allowed.has(program.data)) return res.status(400).json({ error: 'Selecciona una opción de la lista.' });
  try {
    await pool.query('UPDATE participants SET preferred_program=$1, updated_at=NOW() WHERE id=$2', [program.data, req.participantId]);
    res.json({ success: true });
  } catch (error) { next(error); }
});

app.get('/api/admin/leads.csv', requireAdmin, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.school, p.city,
      p.preferred_program, p.consent_privacy, p.consent_marketing, p.created_at,
      (SELECT COUNT(*) FROM challenge_completions c WHERE c.participant_id=p.id) AS completed_challenges,
      (SELECT COUNT(*) FROM talk_attendance t WHERE t.participant_id=p.id) AS talks_attended
      FROM participants p ORDER BY p.created_at DESC`);
    const columns = ['id','first_name','last_name','email','phone','school','city','preferred_program','consent_privacy','consent_marketing','completed_challenges','talks_attended','created_at'];
    const quote = (value) => {
      let text = String(value ?? '');
      if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="santoto-event-leads.csv"');
    res.send('\uFEFF' + [columns.join(','), ...rows.map((row) => columns.map((key) => quote(row[key])).join(','))].join('\n'));
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error('API error:', error.message);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Ocurrió un error. Inténtalo de nuevo.' });
});

await initializeDatabase();
app.listen(port, () => console.info(`Santoto Launch API listening on ${port}`));
process.on('SIGTERM', async () => { await pool.end(); process.exit(0); });
