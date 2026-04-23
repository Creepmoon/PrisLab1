import { createServer } from 'node:http';
import crypto from 'node:crypto';
import {
  auditLog,
  checkRole,
  evaluateRecommendationAccuracy,
  generateRecommendations,
  parseJsonBody,
  roles,
  sendJson
} from '@edusphere/shared';

const PORT = Number(process.env.PORT || 4004);
const plans = new Map();

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { service: 'plan-builder', status: 'ok' });
  }

  if (req.method === 'POST' && url.pathname === '/plans/generate') {
    const body = await parseJsonBody(req).catch((e) => sendJson(res, 400, { error: e.message }));
    if (!body || res.writableEnded) return;
    const requesterRole = req.headers['x-user-role'];
    const requesterId = req.headers['x-user-id'];
    const studentId = checkRole(requesterRole, [roles.TEACHER, roles.ADMIN])
      ? (body.studentId || requesterId)
      : requesterId;
    if (!studentId) {
      return sendJson(res, 400, { error: 'studentId is required' });
    }

    const recommendation = generateRecommendations(body);
    const id = `p-${crypto.randomUUID()}`;
    const plan = {
      id,
      studentId,
      recommendation,
      approvedByTeacher: false,
      teacherAdjustments: []
    };
    plans.set(id, plan);
    auditLog('plan_generated', { id, confidence: recommendation.confidence });
    return sendJson(res, 201, plan);
  }

  if (req.method === 'POST' && url.pathname.startsWith('/plans/') && url.pathname.endsWith('/review')) {
    const role = req.headers['x-user-role'];
    if (!checkRole(role, [roles.TEACHER, roles.ADMIN])) return sendJson(res, 403, { error: 'teacher or admin only' });
    const id = url.pathname.split('/')[2];
    const plan = plans.get(id);
    if (!plan) return sendJson(res, 404, { error: 'plan not found' });

    const body = await parseJsonBody(req).catch((e) => sendJson(res, 400, { error: e.message }));
    if (!body || res.writableEnded) return;

    plan.approvedByTeacher = true;
    plan.teacherAdjustments = body.adjustments || [];
    auditLog('plan_reviewed', { id, reviewer: req.headers['x-user-id'] });
    return sendJson(res, 200, plan);
  }

  if (req.method === 'POST' && url.pathname === '/recommendations/evaluate') {
    const body = await parseJsonBody(req).catch((e) => sendJson(res, 400, { error: e.message }));
    if (!body || res.writableEnded) return;

    const accuracy = evaluateRecommendationAccuracy(body.predictions || [], body.labels || []);
    return sendJson(res, 200, {
      accuracy,
      target: 85,
      passed: accuracy >= 85
    });
  }

  if (req.method === 'GET' && url.pathname === '/plans') {
    const userId = req.headers['x-user-id'];
    const role = req.headers['x-user-role'];
    const items = [...plans.values()].filter((p) => role !== roles.STUDENT || p.studentId === userId);
    return sendJson(res, 200, { items });
  }

  sendJson(res, 404, { error: 'not found' });
}).listen(PORT, () => {
  console.log(`Plan Builder service on :${PORT}`);
});
