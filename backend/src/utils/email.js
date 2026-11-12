
import { queueOtpEmail } from '../services/email-queue.service.js';

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
