import jwt from 'jsonwebtoken';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

export function generateAccessToken(user) {
  const payload = { role: user.role };
  const name = user.full_name || user.fullName || user.name;
  if (name) {
    payload.name = name;
  }

  return jwt.sign(
    payload,
    env.jwtAccessSecret,
    {
      subject: String(user.user_id || user.userId),
      jwtid: randomUUID(),
      expiresIn: env.jwtAccessExpiresIn,
      issuer: 'snapclass-auth',
      audience: 'snapclass-api',
      algorithm: 'HS256',
    }
  );
}

export function generateRefreshToken() {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token) {
  return createHash('sha256')
    .update(token)
    .digest('hex');
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret, {
    issuer: 'snapclass-auth',
    audience: 'snapclass-api',
    algorithms: ['HS256'],
  });
}