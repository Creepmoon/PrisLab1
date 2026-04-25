import crypto from 'node:crypto';

export function getSecret(name, developmentDefault) {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} must be set in production`);
  }
  return developmentDefault;
}

const DEFAULT_SECRET = getSecret('JWT_SECRET', 'dev-secret-change-me');
const ENC_KEY = crypto.createHash('sha256').update(getSecret('DATA_KEY', 'dev-data-key')).digest();

export const roles = Object.freeze({
  STUDENT: 'student',
  TEACHER: 'teacher',
  ADMIN: 'admin'
});

export function signToken(payload, ttlSeconds = 3600, secret = DEFAULT_SECRET) {
  const body = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  };
  const encoded = Buffer.from(JSON.stringify(body)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyToken(token, secret = DEFAULT_SECRET) {
  if (!token || !token.includes('.')) return null;
  const [encoded, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  if (expected !== signature) return null;
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function checkRole(actualRole, allowedRoles = []) {
  return allowedRoles.includes(actualRole);
}

export function encryptText(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptText(cipherText) {
  const input = Buffer.from(cipherText, 'base64');
  const iv = input.subarray(0, 12);
  const tag = input.subarray(12, 28);
  const encrypted = input.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function generateRecommendations({ preferences = [], weakSkills = [], targetHours = 6 }) {
  const topics = [...new Set([...preferences, ...weakSkills])].slice(0, 6);
  const normalizedTarget = Math.max(1, Number(targetHours) || 1);
  const baseHours = topics.length ? Math.floor(normalizedTarget / topics.length) : 0;
  let remainder = topics.length ? normalizedTarget - (baseHours * topics.length) : 0;

  const plan = topics.map((topic, index) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder = Math.max(0, remainder - 1);
    return {
      topic,
      weeklyHours: Math.max(1, baseHours + extra),
      difficulty: weakSkills.includes(topic) ? 'foundation' : index > 2 ? 'advanced' : 'intermediate'
    };
  });

  return {
    confidence: Math.min(0.99, 0.7 + topics.length * 0.05),
    plan
  };
}

export function evaluateRecommendationAccuracy(predictions, labels) {
  if (!predictions.length || predictions.length !== labels.length) return 0;
  let correct = 0;
  for (let i = 0; i < predictions.length; i += 1) {
    if (predictions[i] === labels[i]) correct += 1;
  }
  return Number(((correct / predictions.length) * 100).toFixed(2));
}

export function parseJsonBody(req, maxBytes = Number(process.env.MAX_JSON_BODY_BYTES || 1_000_000)) {
  const sizeLimit = Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : 1_000_000;
  return new Promise((resolve, reject) => {
    let data = '';
    let done = false;
    const fail = (error) => {
      if (done) return;
      done = true;
      reject(error);
    };
    const succeed = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > sizeLimit) {
        req.destroy();
        fail(new Error(`Payload too large (max ${sizeLimit} bytes)`));
      }
    });
    req.on('end', () => {
      if (!data) return succeed({});
      try {
        succeed(JSON.parse(data));
      } catch {
        fail(new Error('Invalid JSON body'));
      }
    });
    req.on('error', fail);
  });
}

export function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export function auditLog(event, payload = {}) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    payload
  }));
}
