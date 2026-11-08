import { createHmac, timingSafeEqual } from 'node:crypto';

const secret = () => {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
  return value;
};

export function signSession(participantId) {
  const payload = Buffer.from(JSON.stringify({ aud: 'participant', sub: participantId, exp: Date.now() + 1000 * 60 * 60 * 24 * 14 })).toString('base64url');
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
    return data.aud === 'participant' && data.exp > Date.now() ? data.sub : null;
  } catch { return null; }
}

function signPayload(data) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyPayload(token = '') {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = createHmac('sha256', secret()).update(payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return null; }
}

export function signAdminSession(email, role) {
  return signPayload({ aud: 'admin', sub: email, role, exp: Date.now() + 1000 * 60 * 60 * 8 });
}

export function verifyAdminSession(token = '') {
  const data = verifyPayload(token);
  return data?.aud === 'admin' && data.exp > Date.now() ? { email: data.sub, role: data.role } : null;
}

export function requireAdmin(roles = ['admin', 'admissions', 'analyst']) {
  return (req, res, next) => {
    const session = verifyAdminSession(req.cookies.santoto_admin_session);
    if (!session) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
    if (!roles.includes(session.role)) return res.status(403).json({ error: 'Tu cuenta no tiene acceso a esta función.' });
    req.admin = session;
    next();
  };
}
