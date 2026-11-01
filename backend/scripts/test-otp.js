
import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  generateAndSendOtp,
  verifyOtp,
} from '../src/services/otp.service.js';

const rl = createInterface({ input: stdin, output: stdout });

try {
  const userId = await rl.question('Enter an existing user ID: ');
  const email = await rl.question('Enter that user’s email: ');
  const purpose = await rl.question(
    'Purpose (EMAIL_VERIFICATION or MFA): '
  );

  const result = await generateAndSendOtp({
    userId: userId.trim(),
    email: email.trim(),
    purpose: purpose.trim(),
  });

  console.log(result.message);
  console.log(`OTP expires in ${result.expiresInSeconds / 60} minutes.`);

  const otp = await rl.question('Enter the OTP received by email: ');

  const isValid = await verifyOtp({
    userId: userId.trim(),
    purpose: purpose.trim(),
    otp: otp.trim(),
  });

  console.log(isValid ? 'OTP verified successfully!' : 'Invalid or expired OTP.');
} catch (error) {
  console.error('OTP test failed:', error.message);
} finally {
  rl.close();
}
