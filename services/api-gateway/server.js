import { createServer } from 'node:http';
import { auditLog, getSecret, sendJson, verifyToken } from '@edusphere/shared';

const PORT = Number(process.env.PORT || 4000);
const SECRET = getSecret('JWT_SECRET', 'dev-secret-change-me');
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 3000);

const routes = [
  { prefix: '/auth', target: process.env.AUTH_SERVICE_URL || 'http://localhost:4001', publicPaths: ['/auth/login', '/auth/register'] },
  { prefix: '/materials', target: process.env.CONTENT_SERVICE_URL || 'http://localhost:4002' },
  { prefix: '/grades', target: process.env.GRADEBOOK_SERVICE_URL || 'http://localhost:4003' },
  { prefix: '/plans', target: process.env.PLAN_SERVICE_URL || 'http://localhost:4004' },
  { prefix: '/recommendations', target: process.env.PLAN_SERVICE_URL || 'http://localhost:4004' },
  { prefix: '/events', target: process.env.ANALYTICS_SERVICE_URL || 'http://localhost:4005' },
  { prefix: '/dashboard', target: process.env.ANALYTICS_SERVICE_URL || 'http://localhost:4005' },
  { prefix: '/ar', target: process.env.AR_SERVICE_URL || 'http://localhost:4006' },
  { prefix: '/health/auth', target: process.env.AUTH_SERVICE_URL || 'http://localhost:4001', rewriteTo: '/health' },
  { prefix: '/health/content', target: process.env.CONTENT_SERVICE_URL || 'http://localhost:4002', rewriteTo: '/health' },
  { prefix: '/health/gradebook', target: process.env.GRADEBOOK_SERVICE_URL || 'http://localhost:4003', rewriteTo: '/health' },
  { prefix: '/health/plan', target: process.env.PLAN_SERVICE_URL || 'http://localhost:4004', rewriteTo: '/health' },
  { prefix: '/health/analytics', target: process.env.ANALYTICS_SERVICE_URL || 'http://localhost:4005', rewriteTo: '/health' },
  { prefix: '/health/ar', target: process.env.AR_SERVICE_URL || 'http://localhost:4006', rewriteTo: '/health' }
];

function findRoute(pathname) {
  return routes.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
}

function getTokenPayload(req) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyToken(auth.slice(7), SECRET);
}

function shouldSkipAuth(route, pathname) {
  return pathname === '/health' || route.publicPaths?.includes(pathname) || pathname.startsWith('/health/');
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? Buffer.concat(chunks) : null;
}

async function forward(req, res, route, pathname) {
  const payload = getTokenPayload(req);
  if (!shouldSkipAuth(route, pathname) && !payload) {
    return sendJson(res, 401, { error: 'unauthorized' });
  }

  const body = await parseBody(req);
  const targetPath = route.rewriteTo || pathname;
  const destination = `${route.target}${targetPath}${new URL(req.url, `http://${req.headers.host}`).search}`;

  const response = await fetch(destination, {
    method: req.method,
    headers: {
      'content-type': req.headers['content-type'] || 'application/json',
      authorization: req.headers.authorization || '',
      'x-user-id': payload?.userId || '',
      'x-user-role': payload?.role || ''
    },
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  }).catch((error) => ({ error }));

  if (response?.error) {
    if (response.error.name === 'TimeoutError') {
      return sendJson(res, 504, { error: 'request timeout' });
    }
    return sendJson(res, 503, { error: 'service unavailable' });
  }

  const text = await response.text();
  res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'application/json' });
  res.end(text);
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { service: 'api-gateway', status: 'ok' });
  }

  const route = findRoute(url.pathname);
  if (!route) return sendJson(res, 404, { error: 'route not found' });

  auditLog('gateway_request', { method: req.method, path: url.pathname });
  return forward(req, res, route, url.pathname);
}).listen(PORT, () => {
  console.log(`API Gateway on :${PORT}`);
});
