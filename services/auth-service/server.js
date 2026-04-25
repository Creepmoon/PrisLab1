import { createServer } from 'node:http';
import crypto from 'node:crypto';
import { auditLog, getSecret, parseJsonBody, roles, sendJson, signToken, verifyToken } from '@edusphere/shared';

const PORT = Number(process.env.PORT || 4001);
const SECRET = getSecret('JWT_SECRET', 'dev-secret-change-me');

const users = new Map();
if (process.env.ADMIN_BOOTSTRAP_PASSWORD) {
  users.set('admin', {
    id: 'admin',
    email: process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@edusphere.local',
    passwordHash: hashPassword(process.env.ADMIN_BOOTSTRAP_PASSWORD),
    role: roles.ADMIN
  });
} else {
  console.warn('Admin bootstrap account is disabled: set ADMIN_BOOTSTRAP_PASSWORD to enable it.');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, existingHash] = (storedHash || '').split(':');
  if (!salt || !existingHash) return false;
  const computedHash = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(existingHash, 'hex');
  if (computedHash.length !== expected.length) return false;
  return crypto.timingSafeEqual(computedHash, expected);
}

function getAuthPayload(req) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyToken(auth.slice(7), SECRET);
}

function matchUserRoute(pathname) {
  const exp = /^\/auth\/users\/([^/]+)(\/export)?$/;
  const match = pathname.match(exp);
  if (!match) return null;
  return { id: match[1], exportMode: Boolean(match[2]) };
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { service: 'auth', status: 'ok' });
  }

  if (req.method === 'POST' && url.pathname === '/auth/register') {
    const body = await parseJsonBody(req).catch((e) => sendJson(res, 400, { error: e.message }));
    if (!body || res.writableEnded) return;

    if (!body.email || !body.password || !Object.values(roles).includes(body.role)) {
      return sendJson(res, 400, { error: 'email, password and role are required' });
    }

    const id = `u-${crypto.randomUUID()}`;
    users.set(id, { id, email: body.email, passwordHash: hashPassword(body.password), role: body.role });
    auditLog('user_registered', { id, role: body.role });
    return sendJson(res, 201, { id, email: body.email, role: body.role });
  }

  if (req.method === 'POST' && url.pathname === '/auth/login') {
    const body = await parseJsonBody(req).catch((e) => sendJson(res, 400, { error: e.message }));
    if (!body || res.writableEnded) return;
    const user = [...users.values()].find((u) => u.email === body.email && verifyPassword(body.password || '', u.passwordHash));
    if (!user) return sendJson(res, 401, { error: 'invalid credentials' });

    const token = signToken({ userId: user.id, role: user.role }, 3600, SECRET);
    auditLog('user_logged_in', { userId: user.id });
    return sendJson(res, 200, { token, user: { id: user.id, email: user.email, role: user.role } });
  }

  if (req.method === 'GET' && url.pathname === '/auth/me') {
    const payload = getAuthPayload(req);
    if (!payload) return sendJson(res, 401, { error: 'unauthorized' });
    const user = users.get(payload.userId);
    if (!user) return sendJson(res, 404, { error: 'user not found' });
    return sendJson(res, 200, { id: user.id, email: user.email, role: user.role });
  }

  const userRoute = matchUserRoute(url.pathname);
  if (userRoute) {
    const payload = getAuthPayload(req);
    if (!payload || payload.role !== roles.ADMIN) return sendJson(res, 403, { error: 'forbidden' });
    const user = users.get(userRoute.id);
    if (!user) return sendJson(res, 404, { error: 'user not found' });

    if (req.method === 'GET' && userRoute.exportMode) {
      auditLog('user_data_exported', { userId: userRoute.id, actor: payload.userId });
      return sendJson(res, 200, { id: user.id, email: user.email, role: user.role });
    }

    if (req.method === 'DELETE' && !userRoute.exportMode) {
      users.delete(userRoute.id);
      auditLog('user_deleted', { userId: userRoute.id, actor: payload.userId });
      return sendJson(res, 200, { deleted: true });
    }
  }

  sendJson(res, 404, { error: 'not found' });
}).listen(PORT, () => {
  console.log(`Auth service on :${PORT}`);
});
