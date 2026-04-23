import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptText,
  encryptText,
  evaluateRecommendationAccuracy,
  signToken,
  verifyToken
} from '../src/index.js';

test('token signing and verification', () => {
  const token = signToken({ userId: 'u1', role: 'student' }, 60, 'secret');
  const payload = verifyToken(token, 'secret');
  assert.equal(payload.userId, 'u1');
  assert.equal(payload.role, 'student');
});

test('encryption roundtrip', () => {
  const source = 'private educational material';
  const encrypted = encryptText(source);
  const decrypted = decryptText(encrypted);
  assert.equal(decrypted, source);
});

test('recommendation accuracy helper', () => {
  const accuracy = evaluateRecommendationAccuracy(
    ['math', 'physics', 'biology', 'history', 'english', 'chemistry'],
    ['math', 'physics', 'biology', 'history', 'english', 'chemistry']
  );
  assert.equal(accuracy, 100);
});
