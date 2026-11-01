
import 'dotenv/config';
import { pool } from '../src/config/db.js';
import { generateAndSendOtp } from '../src/services/otp.service.js';

try {
  const email = process.argv[2]?.trim().toLowerCase();

  if (!email) {
    throw new Error('Usage: node scripts/send-test-otp.js user@example.com');
  }

  const [users] = await pool.execute(
    'SELECT user_id, email, email_verified FROM users WHERE email = ? LIMIT 1',
    [email]
  );

  if (users.length === 0) {
    throw new Error('User account not found.');
  }

  const user = users[0];

  if (Boolean(user.email_verified)) {
    throw new Error('This email is already verified.');
  }

  await generateAndSendOtp({
    userId: String(user.user_id),
    email: user.email,
    purpose: 'EMAIL_VERIFICATION',
  });

  console.log('OTP sent successfully. Use it in Postman.');
} catch (error) {
  console.error('Failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
