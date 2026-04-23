import { createServer } from 'node:http';
import crypto from 'node:crypto';
import { auditLog, checkRole, decryptText, encryptText, parseJsonBody, roles, sendJson } from '@edusphere/shared';

const PORT = Number(process.env.PORT || 4002);
const materials = new Map();

function getRole(req) {
  return req.headers['x-user-role'];
}

function canReadMaterial(role, visibility) {
  if (role === roles.ADMIN) return true;
  if (visibility === 'admin') return false;
  if (visibility === 'teacher') return role === roles.TEACHER;
  if (visibility === 'student') return role === roles.STUDENT || role === roles.TEACHER;
  return false;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { service: 'content', status: 'ok' });
  }

  if (req.method === 'POST' && url.pathname === '/materials') {
    const role = getRole(req);
    if (!checkRole(role, [roles.TEACHER, roles.ADMIN])) {
      return sendJson(res, 403, { error: 'teacher or admin only' });
    }

    const body = await parseJsonBody(req).catch((e) => sendJson(res, 400, { error: e.message }));
    if (!body || res.writableEnded) return;
    if (!body.title || !body.content) return sendJson(res, 400, { error: 'title and content required' });

    const id = `m-${crypto.randomUUID()}`;
    materials.set(id, {
      id,
      title: body.title,
      contentEncrypted: encryptText(body.content),
      tags: body.tags || [],
      authorId: req.headers['x-user-id'] || 'unknown',
      visibility: ['student', 'teacher', 'admin'].includes(body.visibility) ? body.visibility : 'student'
    });
    auditLog('material_created', { id, role });
    return sendJson(res, 201, { id });
  }

  if (req.method === 'GET' && url.pathname === '/materials') {
    const role = getRole(req);
    if (!checkRole(role, [roles.STUDENT, roles.TEACHER, roles.ADMIN])) {
      return sendJson(res, 403, { error: 'forbidden' });
    }
    const page = Math.max(1, Number(url.searchParams.get('page') || 1));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') || 20)));
    const includeContent = url.searchParams.get('includeContent') === 'true';
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const list = [...materials.values()].map((m) => ({
      id: m.id,
      title: m.title,
      tags: m.tags,
      ...(includeContent ? { content: decryptText(m.contentEncrypted) } : {}),
      authorId: m.authorId,
      visibility: m.visibility
    })).filter((m) => canReadMaterial(role, m.visibility));
    return sendJson(res, 200, { items: list.slice(start, end), page, pageSize, total: list.length });
  }

  if (req.method === 'GET' && url.pathname.startsWith('/materials/') && !url.pathname.endsWith('/export')) {
    const role = getRole(req);
    if (!checkRole(role, [roles.STUDENT, roles.TEACHER, roles.ADMIN])) {
      return sendJson(res, 403, { error: 'forbidden' });
    }
    const id = url.pathname.split('/')[2];
    const material = materials.get(id);
    if (!material) return sendJson(res, 404, { error: 'material not found' });
    if (!canReadMaterial(role, material.visibility)) return sendJson(res, 403, { error: 'forbidden' });
    return sendJson(res, 200, {
      id: material.id,
      title: material.title,
      tags: material.tags,
      content: decryptText(material.contentEncrypted),
      authorId: material.authorId,
      visibility: material.visibility
    });
  }

  if (req.method === 'GET' && url.pathname.startsWith('/materials/') && url.pathname.endsWith('/export')) {
    const role = getRole(req);
    if (!checkRole(role, [roles.ADMIN])) return sendJson(res, 403, { error: 'admin only' });
    const id = url.pathname.split('/')[2];
    const material = materials.get(id);
    if (!material) return sendJson(res, 404, { error: 'material not found' });
    return sendJson(res, 200, {
      id,
      title: material.title,
      tags: material.tags,
      content: decryptText(material.contentEncrypted)
    });
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/materials/')) {
    const role = getRole(req);
    if (!checkRole(role, [roles.ADMIN])) return sendJson(res, 403, { error: 'admin only' });
    const id = url.pathname.split('/')[2];
    materials.delete(id);
    auditLog('material_deleted', { id });
    return sendJson(res, 200, { deleted: true });
  }

  sendJson(res, 404, { error: 'not found' });
}).listen(PORT, () => {
  console.log(`Content service on :${PORT}`);
});
