
import nodemailer from 'nodemailer';
import 'dotenv/config';

const required = [
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'EMAIL_FROM',
];

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`Missing email configuration: ${name}`);
  }
}

const port = Number(process.env.SMTP_PORT || 587);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

export async function sendOtpEmail({ email, otp, purpose }) {
  const isVerification = purpose === 'EMAIL_VERIFICATION';

  const subject = isVerification
    ? 'Verify your SnapClass email'
    : 'Your SnapClass login verification code';

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject,
    text: [
      `Your SnapClass verification code is: ${otp}`,
      '',
      `This code expires in ${isVerification ? 10 : 5} minutes.`,
      'Do not share this code with anyone.',
      'If you did not request this code, you can ignore this email.',
    ].join('\n'),
  });
}
