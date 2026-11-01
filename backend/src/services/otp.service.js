
import { randomInt, createHmac } from 'node:crypto';
import { redis } from '../config/redis.js';
import { sendOtpEmail } from '../utils/email.js';

const OTP_HASH_SECRET = process.env.OTP_HASH_SECRET;

if (!OTP_HASH_SECRET || Buffer.byteLength(OTP_HASH_SECRET) < 32) {
  throw new Error('OTP_HASH_SECRET must contain at least 32 bytes.');
}

const PURPOSES = {
  EMAIL_VERIFICATION: {
    ttlSeconds: 600,
    resendSeconds: 60,
  },
  MFA: {
    ttlSeconds: 300,
    resendSeconds: 60,
  },
};

function digestOtp(userId, purpose, otp) {
  return createHmac('sha256', OTP_HASH_SECRET)
    .update(`${userId}:${purpose}:${otp}`)
    .digest('hex');
}

function otpKey(userId, purpose) {
  return `snapclass:otp:${purpose}:${userId}`;
}

function attemptKey(userId, purpose) {
  return `snapclass:otp:attempts:${purpose}:${userId}`;
}

function resendKey(userId, purpose) {
  return `snapclass:otp:resend:${purpose}:${userId}`;
}

export async function generateAndSendOtp({ userId, email, purpose }) {
  const config = PURPOSES[purpose];

  if (!config) {
    throw new Error('Unsupported OTP purpose.');
  }

  const key = otpKey(userId, purpose);
  const cooldownKey = resendKey(userId, purpose);
  const attempts = attemptKey(userId, purpose);

  // Prevent rapid repeated requests for the same purpose.
  const cooldown = await redis.set(
    cooldownKey,
    '1',
    { ex: config.resendSeconds, nx: true }
  );

  if (cooldown !== 'OK') {
    const error = new Error('Please wait before requesting another code.');
    error.statusCode = 429;
    throw error;
  }

  const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const digest = digestOtp(userId, purpose, otp);

  try {
    // Replace any previous OTP and reset its attempt counter.
    await redis.set(key, digest, { ex: config.ttlSeconds });
    await redis.del(attempts);

    await sendOtpEmail({ email, otp, purpose });

    return {
      expiresInSeconds: config.ttlSeconds,
      message: 'Verification code sent.',
    };
  } catch (error) {
    await Promise.all([
      redis.del(key),
      redis.del(attempts),
      redis.del(cooldownKey),
    ]);

    throw error;
  }
}

export async function verifyOtp({ userId, purpose, otp }) {
  if (
    !PURPOSES[purpose] ||
    typeof otp !== 'string' ||
    !/^\d{6}$/.test(otp)
  ) {
    return false;
  }

  const key = otpKey(userId, purpose);
  const attempts = attemptKey(userId, purpose);

  // Allow at most five incorrect attempts.
  const count = await redis.incr(attempts);

  if (count === 1) {
    await redis.expire(attempts, PURPOSES[purpose].ttlSeconds);
  }

  if (count > 5) {
    await redis.del(key);
    return false;
  }

  const submittedDigest = digestOtp(userId, purpose, otp);

  // Atomically compare and consume the OTP.
  const result = await redis.eval(
    `local stored = redis.call('GET', KEYS[1])
     if not stored then return 0 end
     if stored ~= ARGV[1] then return -1 end
     redis.call('DEL', KEYS[1])
     return 1`,
    [key],
    [submittedDigest]
  );

  if (Number(result) === 1) {
    await redis.del(attempts);
    return true;
  }

  return false;
}
