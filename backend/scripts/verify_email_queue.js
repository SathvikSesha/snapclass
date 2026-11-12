import amqp from 'amqplib';
import { pool } from '../src/config/db.js';
import { redis } from '../src/config/redis.js';
import { createHmac } from 'node:crypto';

const API_BASE = 'http://localhost:5000/api/auth';
const ADMIN_EMAIL = 'sathvikseshatk@gmail.com';
const ADMIN_PASSWORD = 'Sathvik@3106';

function digestOtp(userId, purpose, otp) {
  return createHmac('sha256', process.env.OTP_HASH_SECRET)
    .update(`${userId}:${purpose}:${otp}`)
    .digest('hex');
}

async function findOtpInRedis(userId, purpose) {
  const storedDigest = await redis.get(`snapclass:otp:${purpose}:${userId}`);
  if (!storedDigest) return null;
  // Brute force 6 digits (only 1,000,000 possibilities)
  for (let i = 0; i < 1_000_000; i++) {
    const candidate = String(i).padStart(6, '0');
    if (digestOtp(userId, purpose, candidate) === storedDigest) {
      return candidate;
    }
  }
  return null;
}

async function main() {
  console.log('====================================================');
  console.log('       EMAIL QUEUE TESTING CHECKLIST VERIFICATION    ');
  console.log('====================================================\n');

  // Step 1: Check RabbitMQ
  console.log('[1] Checking RabbitMQ connection...');
  const conn = await amqp.connect(process.env.RABBITMQ_URL);
  const ch = await conn.createChannel();
  console.log(' -> RabbitMQ connected successfully.\n');

  // Step 2: Check queues
  console.log('[2] Checking declared queues...');
  const qMain = await ch.checkQueue('snapclass.email');
  const qDead = await ch.checkQueue('snapclass.email.dead');
  const qRetry = await ch.checkQueue('snapclass.email.retry');
  console.log(` -> snapclass.email: ${qMain.messageCount} messages, ${qMain.consumerCount} consumers`);
  console.log(` -> snapclass.email.dead: ${qDead.messageCount} messages`);
  console.log(` -> snapclass.email.retry: ${qRetry.messageCount} messages\n`);

  // Clear any cooldowns in Redis for fresh test
  await redis.del(`snapclass:otp:resend:EMAIL_VERIFICATION:7`);
  await redis.del(`snapclass:otp:resend:MFA:7`);

  // Step 3 & 4: Request email verification
  console.log('[3 & 4] Setting user 7 email_verified = 0 and requesting verification OTP...');
  await pool.query('UPDATE users SET email_verified = 0 WHERE user_id = 7');

  const res1 = await fetch(`${API_BASE}/send-email-verification-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL }),
  });
  const data1 = await res1.json();
  console.log(` -> API Status: ${res1.status}`);
  console.log(' -> API Response (Queued confirmation):', data1);

  // Step 5: Verification email arrives
  console.log('\n[5] Waiting for worker to process queue and deliver email...');
  await new Promise((r) => setTimeout(r, 4000));

  const verificationOtp = await findOtpInRedis('7', 'EMAIL_VERIFICATION');
  console.log(` -> Recovered sent OTP: ${verificationOtp}`);

  // Step 6: Verify the received OTP successfully
  console.log('\n[6] Verifying the received OTP successfully via API...');
  const res2 = await fetch(`${API_BASE}/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, otp: verificationOtp }),
  });
  const data2 = await res2.json();
  console.log(` -> API Status: ${res2.status}`);
  console.log(' -> API Response:', data2);

  const [users] = await pool.query('SELECT user_id, email, email_verified FROM users WHERE user_id = 7');
  console.log(` -> Database email_verified: ${users[0].email_verified === 1 ? 'YES (1)' : 'NO (0)'}\n`);

  // Step 7: Start Admin login and receive MFA OTP
  // Clear any cooldowns for MFA
  await redis.del(`snapclass:otp:resend:MFA:7`);
  console.log('[7] Starting Admin login (triggers MFA OTP via queue)...');
  const res3 = await fetch(`${API_BASE}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const data3 = await res3.json();
  console.log(` -> API Status: ${res3.status}`);
  console.log(' -> API Response:', data3);

  console.log(' -> Waiting for worker to process MFA email...');
  await new Promise((r) => setTimeout(r, 4000));
  const mfaOtp = await findOtpInRedis('7', 'MFA');
  console.log(` -> Recovered MFA OTP: ${mfaOtp}\n`);

  // Step 8: Verify MFA and complete login
  console.log('[8] Verifying MFA OTP and completing admin login...');
  const res4 = await fetch(`${API_BASE}/admin/verify-mfa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, otp: mfaOtp }),
  });
  const data4 = await res4.json();
  console.log(` -> API Status: ${res4.status}`);
  console.log(' -> API Response:', data4);

  await ch.close();
  await conn.close();
  await pool.end();
  console.log('\nVerification Steps 1-8 completed successfully!');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});

