
import amqp from 'amqplib';
import nodemailer from 'nodemailer';
import 'dotenv/config';

const QUEUE = 'snapclass.email';
const RETRY_QUEUE = 'snapclass.email.retry';
const DEAD_QUEUE = 'snapclass.email.dead';

const MAX_RETRIES = 5;

const required = [
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'EMAIL_FROM',
  'RABBITMQ_URL',
];

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`Missing configuration: ${name}`);
  }
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

async function sendEmail(job) {
  const email = buildEmail(job);

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    ...email,
  });
}


function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };

    return entities[character];
  });
}


async function startWorker() {
  const connection = await amqp.connect(process.env.RABBITMQ_URL);
  const channel = await connection.createConfirmChannel();

  await channel.assertQueue(QUEUE, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': DEAD_QUEUE,
    },
  });

  await channel.assertQueue(RETRY_QUEUE, {
    durable: true,
    arguments: {
      'x-message-ttl': 30000,
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': QUEUE,
    },
  });

  await channel.assertQueue(DEAD_QUEUE, {
    durable: true,
  });

  // Each worker can process up to 5 unacknowledged messages.
  channel.prefetch(5);

  console.log('SnapClass email worker is running...');

  await channel.consume(QUEUE, async (message) => {
    if (!message) return;

    try {
      const job = JSON.parse(message.content.toString());

      await sendEmail(job);

      channel.ack(message);

      console.log(`Email sent: ${job.type} -> ${job.email}`);
    } catch (error) {
      console.error('Email processing failed:', error.message);

      const previousRetries =
        Number(message.properties.headers?.['x-retry-count'] || 0);

      if (previousRetries < MAX_RETRIES) {
        try {
          channel.sendToQueue(RETRY_QUEUE, message.content, {
            persistent: true,
            contentType: 'application/json',
            headers: {
              ...message.properties.headers,
              'x-retry-count': previousRetries + 1,
            },
          });

          await channel.waitForConfirms();
          channel.ack(message);

          console.log(`Email queued for retry ${previousRetries + 1}`);
        } catch (publishError) {
          console.error('Could not publish retry:', publishError.message);
          channel.nack(message, false, true);
        }
      } else {
        // Route exhausted messages to the dead-letter queue.
        try {
          channel.sendToQueue(DEAD_QUEUE, message.content, {
            persistent: true,
            contentType: 'application/json',
            headers: {
              ...message.properties.headers,
              'x-retry-count': previousRetries,
              'x-failure-reason': error.message,
            },
          });

          await channel.waitForConfirms();
          channel.ack(message);

          console.error('Email moved to dead-letter queue.');
        } catch (publishError) {
          console.error('Could not publish dead letter:', publishError.message);
          channel.nack(message, false, true);
        }
      }
    }
  });

  connection.on('error', (error) => {
    console.error('RabbitMQ worker connection error:', error.message);
  });

  connection.on('close', () => {
    console.error('RabbitMQ worker connection closed.');
    process.exit(1);
  });
}

startWorker().catch((error) => {
  console.error('Could not start email worker:', error);
  process.exit(1);
});



function buildEmail(job) {
  if (job.type === 'OTP') {
    const isVerification = job.purpose === 'EMAIL_VERIFICATION';

    if (
      !job.email ||
      typeof job.otp !== 'string' ||
      !['EMAIL_VERIFICATION', 'MFA'].includes(job.purpose)
    ) {
      throw new Error('Invalid OTP email job.');
    }

    return {
      to: job.email,
      subject: isVerification
        ? 'Verify your SnapClass email'
        : 'Your SnapClass login verification code',
      text: [
        `Your SnapClass verification code is: ${job.otp}`,
        '',
        `This code expires in ${isVerification ? 10 : 5} minutes.`,
        'Do not share this code with anyone.',
        'If you did not request this code, you can ignore this email.',
      ].join('\n'),
    };
  }

  
if (job.type === 'ACCOUNT_REMOVED') {
  if (!job.email || !job.fullName || !job.role) {
    throw new Error('Invalid account removal email job.');
  }

  const safeName = escapeHtml(job.fullName);
  const safeRole = escapeHtml(job.role);

  return {
    to: job.email,
    subject: 'An update about your SnapClass account',

    text: [
      `Hello ${job.fullName},`,
      '',
      'Your SnapClass account has been disabled by an administrator.',
      'You will no longer be able to sign in or access the portal.',
      '',
      'Thank you for being part of SnapClass. We appreciate your participation and wish you the best.',
      '',
      'Regards,',
      'SnapClass Team',
    ].join('\n'),

    html: `
      <!DOCTYPE html>
      <html>
        <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
            style="background-color:#f3f4f6;padding:32px 12px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
                  style="max-width:600px;background-color:#ffffff;border-radius:14px;overflow:hidden;">

                  <tr>
                    <td style="background-color:#312e81;padding:30px 32px;text-align:center;">
                      <h1 style="margin:0;color:#ffffff;font-size:27px;letter-spacing:0.5px;">
                        SnapClass
                      </h1>
                      <p style="margin:8px 0 0;color:#c7d2fe;font-size:13px;">
                        Learning. Connecting. Growing.
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:34px 32px 20px;">
                      <p style="font-size:16px;margin:0 0 18px;">
                        Hello <strong>${safeName}</strong>,
                      </p>

                      <p style="font-size:15px;line-height:1.7;color:#4b5563;margin:0 0 22px;">
                        We wanted to inform you that an administrator has disabled
                        your SnapClass account.
                      </p>

                      <div style="background-color:#fff7ed;border:1px solid #fed7aa;border-left:4px solid #f97316;border-radius:8px;padding:18px;margin-bottom:24px;">
                        <p style="margin:0 0 8px;color:#9a3412;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">
                          Account status
                        </p>
                        <p style="margin:0 0 10px;color:#c2410c;font-size:20px;font-weight:bold;">
                          Access Disabled
                        </p>
                        <p style="margin:0;color:#7c2d12;font-size:13px;line-height:1.6;">
                          Your ${safeRole.toLowerCase()} account can no longer sign in
                          or access the SnapClass portal.
                        </p>
                      </div>

                      <p style="font-size:14px;line-height:1.7;color:#4b5563;margin:0 0 18px;">
                        Thank you for being a part of SnapClass. We appreciate the
                        time you spent with our platform and wish you success in
                        your future endeavours.
                      </p>

                      <p style="font-size:14px;line-height:1.7;color:#4b5563;margin:0;">
                        If you believe this action was taken by mistake, please
                        contact your institution's administration.
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:20px 32px 28px;border-top:1px solid #e5e7eb;">
                      <p style="margin:0 0 5px;color:#374151;font-size:14px;font-weight:bold;">
                        Regards,
                      </p>
                      <p style="margin:0;color:#4f46e5;font-size:14px;font-weight:bold;">
                        SnapClass Team
                      </p>
                      <p style="margin:18px 0 0;color:#9ca3af;font-size:11px;line-height:1.5;">
                        This is an automated notification. Please do not reply to this email.
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  };
}


  throw new Error(`Unsupported email job type: ${job.type}`);
}

