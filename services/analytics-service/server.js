import { createServer } from 'node:http';
import { auditLog, parseJsonBody, sendJson } from '@edusphere/shared';

const PORT = Number(process.env.PORT || 4005);
const events = [];

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { service: 'analytics', status: 'ok' });
  }

  if (req.method === 'POST' && url.pathname === '/events') {
    const body = await parseJsonBody(req).catch((e) => sendJson(res, 400, { error: e.message }));
    if (!body || res.writableEnded) return;

    const event = {
      timestamp: new Date().toISOString(),
      userId: req.headers['x-user-id'] || 'anonymous',
      type: body.type || 'unknown',
      payload: body.payload || {}
    };
    events.push(event);
    auditLog('analytics_event_received', { type: event.type, userId: event.userId });
    return sendJson(res, 201, { accepted: true });
  }

  if (req.method === 'GET' && url.pathname === '/dashboard') {
    const byType = {};
    for (const event of events) {
      byType[event.type] = (byType[event.type] || 0) + 1;
    }
    return sendJson(res, 200, {
      totalEvents: events.length,
      byType
    });
  }

  sendJson(res, 404, { error: 'not found' });
}).listen(PORT, () => {
  console.log(`Analytics service on :${PORT}`);
});
