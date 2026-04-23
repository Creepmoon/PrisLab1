import { createServer } from 'node:http';
import crypto from 'node:crypto';
import { parseJsonBody, sendJson } from '@edusphere/shared';

const PORT = Number(process.env.PORT || 4006);
const sessions = new Map();

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { service: 'ar-session', status: 'ok' });
  }

  if (req.method === 'POST' && url.pathname === '/ar/check-device') {
    const body = await parseJsonBody(req).catch((e) => sendJson(res, 400, { error: e.message }));
    if (!body || res.writableEnded) return;
    const fps = Number(body?.fps || 0);
    const latency = Number(body?.latencyMs || 1000);
    const supportsAr = Boolean(body?.arKit || body?.arCore);

    return sendJson(res, 200, {
      supportsAr,
      meetsSla: supportsAr && fps > 30 && latency < 150,
      fallbackMode: !supportsAr
    });
  }

  if (req.method === 'POST' && url.pathname === '/ar/sessions') {
    const body = await parseJsonBody(req).catch((e) => sendJson(res, 400, { error: e.message }));
    if (!body || res.writableEnded) return;

    const id = `ar-${crypto.randomUUID()}`;
    const session = {
      id,
      classId: body.classId,
      mode: body.supportsAr ? 'ar' : '2d-fallback',
      targetFps: 30,
      maxLatencyMs: 150
    };
    sessions.set(id, session);
    return sendJson(res, 201, session);
  }

  if (req.method === 'GET' && url.pathname === '/ar/sessions') {
    return sendJson(res, 200, { items: [...sessions.values()] });
  }

  sendJson(res, 404, { error: 'not found' });
}).listen(PORT, () => {
  console.log(`AR session service on :${PORT}`);
});
