import jwt from 'jsonwebtoken';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

export function generateAccessToken(user) {
  return jwt.sign(
    { role: user.role },
    env.jwtAccessSecret,
    {
      subject: String(user.user_id),
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