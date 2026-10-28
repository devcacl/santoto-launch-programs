import { createHmac, timingSafeEqual } from 'node:crypto';

const secret = () => {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
  return value;
};

export function signSession(participantId) {
  const payload = Buffer.from(JSON.stringify({ sub: participantId, exp: Date.now() + 1000 * 60 * 60 * 24 * 14 })).toString('base64url');
  const signature = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySession(token = '') {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = createHmac('sha256', secret()).update(payload).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() ? data.sub : null;
  } catch { return null; }
}

export function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_API_KEY;
  const provided = req.get('x-admin-key') || '';
  if (!expected || expected.length < 32) return res.status(503).json({ error: 'La administración no está configurada.' });
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return res.status(401).json({ error: 'No autorizado.' });
  next();
}
