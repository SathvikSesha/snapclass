
import { redis } from '../config/redis.js';
import { hashRefreshToken } from '../utils/token.js';
import { env } from '../config/env.js';

function refreshKey(token) {
  return `snapclass:refresh:${hashRefreshToken(token)}`;
}

function userSessionsKey(userId) {
  return `snapclass:user-sessions:${userId}`;
}

export async function createRefreshSession({
  userId,
  role,
  refreshToken,
}) {
  const tokenHash = hashRefreshToken(refreshToken);
  const key = `snapclass:refresh:${tokenHash}`;
  const sessionsKey = userSessionsKey(userId);

  const result = await redis.set(
    key,
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

  // Maintain an index of all refresh sessions belonging to this user.
  await redis.sadd(sessionsKey, tokenHash);
  await redis.expire(sessionsKey, env.jwtRefreshTtlSeconds);
}

export async function rotateRefreshSession({
  oldRefreshToken,
  newRefreshToken,
}) {
  const oldHash = hashRefreshToken(oldRefreshToken);
  const newHash = hashRefreshToken(newRefreshToken);

  const oldKey = `snapclass:refresh:${oldHash}`;
  const newKey = `snapclass:refresh:${newHash}`;

  const result = await redis.eval(
    `local session = redis.call('GET', KEYS[1])
     if not session then return 0 end
     if redis.call('EXISTS', KEYS[2]) == 1 then return -1 end

     local data = cjson.decode(session)
     local sessionsKey = ARGV[2] .. data.userId

     redis.call('SET', KEYS[2], session, 'EX', ARGV[1])
     redis.call('DEL', KEYS[1])

     redis.call('SREM', sessionsKey, ARGV[3])
     redis.call('SADD', sessionsKey, ARGV[4])
     redis.call('EXPIRE', sessionsKey, ARGV[1])

     return session`,
    [oldKey, newKey],
    [
      String(env.jwtRefreshTtlSeconds),
      'snapclass:user-sessions:',
      oldHash,
      newHash,
    ]
  );

  if (!result || result === 0 || result === -1) {
    return null;
  }

  if (typeof result === 'object') {
    return result;
  }

  if (typeof result === 'string') {
    try {
      return JSON.parse(result);
    } catch {
      return null;
    }
  }

  return null;
}

export async function revokeRefreshSession(refreshToken) {
  const tokenHash = hashRefreshToken(refreshToken);
  const key = `snapclass:refresh:${tokenHash}`;

  const sessionData = await redis.get(key);

  if (!sessionData) {
    return;
  }

  let session;

  try {
    session =
      typeof sessionData === 'string'
        ? JSON.parse(sessionData)
        : sessionData;
  } catch {
    await redis.del(key);
    return;
  }

  await redis.del(key);

  if (session?.userId) {
    await redis.srem(userSessionsKey(session.userId), tokenHash);
  }
}

export async function revokeAllUserSessions(userId) {
  const sessionsKey = userSessionsKey(userId);
  const tokenHashes = await redis.smembers(sessionsKey);

  if (tokenHashes.length > 0) {
    const refreshKeys = tokenHashes.map(
      (hash) => `snapclass:refresh:${hash}`
    );

    await redis.del(...refreshKeys);
  }

  await redis.del(sessionsKey);

  return tokenHashes.length;
}
