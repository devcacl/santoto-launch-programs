import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool, query, initializeDatabase } from './db.js';
import { requireAdmin, signAdminSession, signSession, verifySession } from './security.js';
import { validChallengeAnswer } from './challenges.js';
import { filterConfiguredTalkAttendance } from './progress.js';

const app = express();
const config = JSON.parse(await readFile(new URL('./config/event.json', import.meta.url), 'utf8'));
const port = Number(process.env.PORT || 3001);
const cookieName = 'santoto_session';
const adminCookieName = 'santoto_admin_session';
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  const required = ['APP_ORIGIN', 'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'SESSION_SECRET', 'ADMIN_USERS_JSON'];
  const missing = required.filter((name) => !process.env[name] || process.env[name].length < (['SESSION_SECRET', 'DB_PASSWORD'].includes(name) ? 32 : 1));
  if (missing.length) throw new Error(`Missing or weak production configuration: ${missing.join(', ')}`);
  if (process.env.COOKIE_SECURE !== 'true' || process.env.DB_SSL !== 'true') throw new Error('Production requires COOKIE_SECURE=true and DB_SSL=true');
  if (/localhost|127\.0\.0\.1/i.test(process.env.APP_ORIGIN)) throw new Error('APP_ORIGIN must use the approved HTTPS origin in production');
  let productionOrigin;
  try { productionOrigin = new URL(process.env.APP_ORIGIN); } catch { throw new Error('APP_ORIGIN must be a valid HTTPS origin'); }
  if (productionOrigin.protocol !== 'https:') throw new Error('APP_ORIGIN must use HTTPS in production');
  try {
    const accounts = JSON.parse(process.env.ADMIN_USERS_JSON);
    const invalidAccount = (account) => !account || !/^\S+@\S+\.\S+$/.test(account.email) || !/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/.test(account.passwordHash) || !['admin', 'admissions', 'analyst'].includes(account.role);
    const normalizedEmails = Array.isArray(accounts) ? accounts.map((account) => account?.email?.toLowerCase()) : [];
    if (!Array.isArray(accounts) || !accounts.length || accounts.some(invalidAccount) || new Set(normalizedEmails).size !== accounts.length) throw new Error();
  } catch { throw new Error('ADMIN_USERS_JSON must contain named users with bcrypt cost-12 hashes and approved roles'); }
  try {
    const checkinCodes = JSON.parse(process.env.AUDITORIUM_CHECKIN_CODES || '{}');
    if (config.talks.some((talk) => typeof checkinCodes[talk.id] !== 'string' || checkinCodes[talk.id].length < 16 || checkinCodes[talk.id].startsWith('DEMO-'))) throw new Error();
  } catch { throw new Error('Set a unique private check-in code of at least 16 characters per auditorium talk'); }
}

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.APP_ORIGIN || 'http://localhost:5173', credentials: true, methods: ['GET', 'POST', 'PATCH'] }));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use('/api', rateLimit({ windowMs: 60_000, limit: Number(process.env.API_RATE_LIMIT_PER_IP || 5000), standardHeaders: 'draft-7', legacyHeaders: false }));
// Event attendees commonly share one campus NAT IP; keep this high enough for enrollment day.
app.use('/api/auth/register', rateLimit({ windowMs: 15 * 60_000, limit: Number(process.env.REGISTRATION_RATE_LIMIT_PER_IP || 500), standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api/admin/auth/login', rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false }));

const adminLoginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(12).max(200) });
function isTrustedAdminOrigin(req) { return req.get('origin') === (process.env.APP_ORIGIN || 'http://localhost:5173'); }
function adminCookieOptions() { return { httpOnly: true, secure: process.env.COOKIE_SECURE === 'true' || isProduction, sameSite: 'strict', maxAge: 8 * 60 * 60 * 1000, path: '/api/admin' }; }

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
    const { rows } = await query('SELECT id FROM participants WHERE id = $1', [id]);
    if (!rows.length) return res.status(401).json({ error: 'La sesión ya no está activa.' });
    req.participantId = id;
    next();
  } catch (error) { next(error); }
}

async function getProgress(id) {
  const [challenges, talks] = await Promise.all([
    query('SELECT program_id, challenge_id, answer_index, completed_at FROM challenge_completions WHERE participant_id = $1', [id]),
    query('SELECT talk_id, checked_in_at FROM talk_attendance WHERE participant_id = $1', [id]),
  ]);
  const completedChallenges = challenges.rows;
  const completedTalks = filterConfiguredTalkAttendance(talks.rows, config.talks);
  const auditoriumBadge = config.talks.length > 0 && config.talks.every((talk) => completedTalks.some((row) => row.talk_id === talk.id));
  const coins = completedChallenges.length * config.gamification.coinsPerChallenge
    + completedTalks.length * config.gamification.coinsPerTalk
    + completedChallenges.length * config.gamification.coinsPerBadge
    + (auditoriumBadge ? config.gamification.coinsPerAuditoriumBadge : 0);
  const challengeBadges = completedChallenges.map((row) => `${row.program_id}:${row.challenge_id}`);
  return { challenges: completedChallenges, talks: completedTalks, coins, badges: [...challengeBadges, ...(auditoriumBadge ? ['auditorium'] : [])] };
}

app.get('/api/health', async (_req, res) => {
  try { await query('SELECT 1 AS database_ready'); res.json({ status: 'ok', database: 'ok' }); }
  catch { res.status(503).json({ status: 'unavailable', database: 'unavailable' }); }
});
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
    const inserted = await query(`INSERT IGNORE INTO participants (id, first_name, last_name, email, phone, school, city, consent_privacy, consent_marketing)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, input.firstName, input.lastName, email, input.phone || null, input.school || null, input.city || null, input.consentPrivacy, input.consentMarketing]);
    if (!inserted.rowCount) return res.status(409).json({ error: 'Este correo ya tiene un recorrido asociado. Continúa desde el dispositivo donde te registraste o solicita apoyo al equipo del evento.' });
    res.cookie(cookieName, signSession(id), { httpOnly: true, secure: process.env.COOKIE_SECURE === 'true' || isProduction, sameSite: 'lax', maxAge: 14 * 24 * 60 * 60 * 1000, path: '/' });
    res.json({
      participant: { id, first_name: input.firstName, last_name: input.lastName, preferred_program: null },
      progress: { challenges: [], talks: [], coins: 0, badges: [] },
    });
  } catch (error) { next(error); }
});

app.get('/api/me', requireParticipant, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, first_name, last_name, preferred_program FROM participants WHERE id=$1', [req.participantId]);
    res.json({ participant: rows[0], progress: await getProgress(req.participantId) });
  } catch (error) { next(error); }
});

app.get('/api/session', async (req, res, next) => {
  const id = participantId(req);
  res.set('Cache-Control', 'no-store');
  if (!id) return res.json({ participant: null });
  try {
    const { rows } = await query('SELECT id, first_name, last_name, preferred_program FROM participants WHERE id=$1', [id]);
    if (!rows.length) return res.json({ participant: null });
    res.json({ participant: rows[0], progress: await getProgress(id) });
  } catch (error) { next(error); }
});

app.post('/api/admin/auth/login', async (req, res) => {
  if (!isTrustedAdminOrigin(req)) return res.status(403).json({ error: 'Origen no permitido.' });
  const parsed = adminLoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Revisa el correo y la contraseña.' });
  let accounts;
  try { accounts = JSON.parse(process.env.ADMIN_USERS_JSON || '[]'); }
  catch { return res.status(503).json({ error: 'El acceso administrativo no está configurado.' }); }
  const email = parsed.data.email.toLowerCase();
  const account = Array.isArray(accounts) ? accounts.find((item) => item.email?.toLowerCase() === email) : null;
  const dummyHash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6FzM5J2qPz3r6J3W8S1MxdpWHaY9K';
  const passwordMatches = await bcrypt.compare(parsed.data.password, account?.passwordHash || dummyHash);
  if (!account || !passwordMatches || !['admin', 'admissions', 'analyst'].includes(account.role)) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  res.cookie(adminCookieName, signAdminSession(email, account.role), adminCookieOptions());
  res.set('Cache-Control', 'no-store');
  res.json({ user: { email, role: account.role } });
});

app.get('/api/admin/auth/me', requireAdmin(), (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ user: req.admin });
});

app.post('/api/admin/auth/logout', requireAdmin(), (req, res) => {
  if (!isTrustedAdminOrigin(req)) return res.status(403).json({ error: 'Origen no permitido.' });
  res.clearCookie(adminCookieName, adminCookieOptions());
  res.status(204).end();
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
      const result = await query('SELECT 1 FROM challenge_completions WHERE participant_id=$1 AND program_id=$2 AND challenge_id=$3', [req.participantId, programId, previous.id]);
      if (!result.rowCount) return res.status(409).json({ error: 'Completa el reto anterior para continuar.' });
    }
    const inserted = await query(`INSERT IGNORE INTO challenge_completions (participant_id, program_id, challenge_id, answer_index, answer_json)
      VALUES ($1,$2,$3,0,$4)`, [req.participantId, programId, challengeId, JSON.stringify(req.body.answer)]);
    const progress = await getProgress(req.participantId);
    const badgeEarned = inserted.rowCount > 0;
    const coinsAwarded = inserted.rowCount ? config.gamification.coinsPerChallenge + config.gamification.coinsPerBadge : 0;
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
    const inserted = await query('INSERT IGNORE INTO talk_attendance (participant_id, talk_id) VALUES ($1,$2)', [req.participantId, talk.id]);
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
    await query('UPDATE participants SET preferred_program=$1, updated_at=NOW() WHERE id=$2', [program.data, req.participantId]);
    res.json({ success: true });
  } catch (error) { next(error); }
});

app.get('/api/admin/overview', requireAdmin(), async (_req, res, next) => {
  try {
    const [totals, preferences, activities] = await Promise.all([
      query(`SELECT COUNT(*) AS leads,
        SUM(CASE WHEN preferred_program IS NOT NULL THEN 1 ELSE 0 END) AS with_preference,
        SUM(CASE WHEN consent_marketing = 1 THEN 1 ELSE 0 END) AS marketing_opt_in,
        SUM(CASE WHEN created_at >= CURRENT_DATE() THEN 1 ELSE 0 END) AS today
        FROM participants`),
      query(`SELECT preferred_program AS name, COUNT(*) AS count FROM participants
        WHERE preferred_program IS NOT NULL GROUP BY preferred_program ORDER BY count DESC`),
      query(`SELECT (SELECT COUNT(*) FROM challenge_completions) AS challenges,
        (SELECT COUNT(*) FROM talk_attendance) AS talk_checkins`),
    ]);
    res.set('Cache-Control', 'no-store');
    res.json({ totals: totals.rows[0], preferences: preferences.rows, activities: activities.rows[0] });
  } catch (error) { next(error); }
});

app.get('/api/admin/leads', requireAdmin(), async (req, res, next) => {
  const page = Math.min(100_000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 25));
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
  try {
    const term = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    const match = search ? 'WHERE p.first_name LIKE $1 OR p.last_name LIKE $1 OR p.email LIKE $1 OR p.preferred_program LIKE $1' : '';
    const params = search ? [term] : [];
    const count = await query(`SELECT COUNT(*) AS total FROM participants p ${match}`, params);
    const rows = await query(`SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.school, p.city,
      p.preferred_program, p.consent_privacy, p.consent_marketing, p.created_at,
      (SELECT COUNT(*) FROM challenge_completions c WHERE c.participant_id=p.id) AS completed_challenges,
      (SELECT COUNT(*) FROM talk_attendance t WHERE t.participant_id=p.id) AS talks_attended
      FROM participants p ${match} ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, (page - 1) * pageSize]);
    res.set('Cache-Control', 'no-store');
    res.json({ leads: rows.rows, page, pageSize, total: Number(count.rows[0].total) });
  } catch (error) { next(error); }
});

app.get('/api/admin/leads.csv', requireAdmin(['admin', 'admissions']), async (_req, res, next) => {
  try {
    const { rows } = await query(`SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.school, p.city,
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
