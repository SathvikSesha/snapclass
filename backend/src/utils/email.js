
import { queueOtpEmail, queuePasswordResetEmail } from '../services/email-queue.service.js';

export async function sendOtpEmail({ email, otp, purpose }) {
  await queueOtpEmail({
    email,
    otp,
    purpose,
  });

  return {
    queued: true,
  };
}

export async function sendPasswordResetEmail({ email, otp }) {
  await queuePasswordResetEmail({ email, otp });
  return { queued: true };
}
