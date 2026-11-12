import amqp from 'amqplib';
import { redis } from '../src/config/redis.js';

const ADMIN_EMAIL = 'sathvikseshatk@gmail.com';
const API_BASE = 'http://localhost:5000/api/auth';

async function checkQueueState() {
  const conn = await amqp.connect(process.env.RABBITMQ_URL);
  const ch = await conn.createChannel();
  const q = await ch.checkQueue('snapclass.email');
  await ch.close();
  await conn.close();
  return q;
}

async function step9_part1() {
  console.log('=== PART 1: Worker is stopped ===');
  const qBefore = await checkQueueState();
  console.log(`Queue state before request: ${qBefore.messageCount} messages, ${qBefore.consumerCount} consumers`);

  // Clear resend cooldown in Redis
  await redis.del('snapclass:otp:resend:MFA:7');

  console.log('Requesting OTP while worker is stopped...');
  const res = await fetch(`${API_BASE}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: 'Sathvik@3106' }),
  });
  const data = await res.json();
  console.log(`API response (status ${res.status}):`, data);

  const qAfter = await checkQueueState();
  console.log(`Queue state after request: ${qAfter.messageCount} message(s) pending in queue, ${qAfter.consumerCount} consumers`);
}

async function step9_part2() {
  console.log('\n=== PART 2: Worker restarted, checking delivery ===');
  // Wait up to 10 seconds for worker to process
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const q = await checkQueueState();
    console.log(`Check ${i + 1}: ${q.messageCount} messages remaining in queue, ${q.consumerCount} consumers`);
    if (q.messageCount === 0 && q.consumerCount > 0) {
      console.log('Pending message was successfully picked up and processed by the restarted worker!');
      return true;
    }
  }
  return false;
}

const action = process.argv[2];
if (action === 'part1') {
  step9_part1().catch(console.error);
} else if (action === 'part2') {
  step9_part2().catch(console.error);
}

