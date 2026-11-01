import { redis } from '../config/redis.js';
import {
  hashRefreshToken,
} from '../utils/token.js';
import { env } from '../config/env.js';

function refreshKey(token) {
  return `snapclass:refresh:${hashRefreshToken(token)}`;
}

export async function createRefreshSession({
  userId,
  role,
  refreshToken,
}) {
  const result = await redis.set(
    refreshKey(refreshToken),
    JSON.stringify({
      userId: String(userId),
      role,
    }),
    {
      ex: env.jwtRefreshTtlSeconds,
      nx: true,
    }
  );

  if (result !== 'OK') {
    throw new Error('Could not create refresh session.');
  }
}

export async function rotateRefreshSession({
  oldRefreshToken,
  newRefreshToken,
}) {
  const oldKey = refreshKey(oldRefreshToken);
  const newKey = refreshKey(newRefreshToken);

  const result = await redis.eval(
    `local session = redis.call('GET', KEYS[1])
     if not session then return 0 end
     if redis.call('EXISTS', KEYS[2]) == 1 then return -1 end
     redis.call('SET', KEYS[2], session, 'EX', ARGV[1])
     redis.call('DEL', KEYS[1])
     return session`,
    [oldKey, newKey],
    [String(env.jwtRefreshTtlSeconds)]
  );

  if (typeof result !== 'string' || !result.startsWith('{')) {
    return null;
  }

  return JSON.parse(result);
}

export async function revokeRefreshSession(refreshToken) {
  await redis.del(refreshKey(refreshToken));
}