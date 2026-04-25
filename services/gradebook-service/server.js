import { createServer } from 'node:http';
import crypto from 'node:crypto';
import { auditLog, checkRole, parseJsonBody, roles, sendJson } from '@edusphere/shared';

const PORT = Number(process.env.PORT || 4003);
const grades = [];

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { service: 'gradebook', status: 'ok' });
  }

  if (req.method === 'POST' && url.pathname === '/grades') {
    const role = req.headers['x-user-role'];
    if (!checkRole(role, [roles.TEACHER, roles.ADMIN])) return sendJson(res, 403, { error: 'forbidden' });

    const body = await parseJsonBody(req).catch((e) => sendJson(res, 400, { error: e.message }));
    if (!body || res.writableEnded) return;
    if (!body.studentId || !body.subject || body.score == null) {
      return sendJson(res, 400, { error: 'studentId, subject and score required' });
    }

    const grade = {
      id: `g-${crypto.randomUUID()}`,
      studentId: body.studentId,
      subject: body.subject,
      score: Number(body.score),
      teacherId: req.headers['x-user-id']
    };
    grades.push(grade);
    auditLog('grade_assigned', grade);
    return sendJson(res, 201, grade);
  }

  if (req.method === 'GET' && url.pathname === '/grades') {
    const role = req.headers['x-user-role'];
    const userId = req.headers['x-user-id'];
    const studentId = url.searchParams.get('studentId');

    let filtered = grades;
    if (checkRole(role, [roles.STUDENT])) {
      filtered = grades.filter((g) => g.studentId === userId);
    } else if (studentId) {
      filtered = grades.filter((g) => g.studentId === studentId);
    }

    return sendJson(res, 200, { items: filtered });
  }

  sendJson(res, 404, { error: 'not found' });
}).listen(PORT, () => {
  console.log(`Gradebook service on :${PORT}`);
});
