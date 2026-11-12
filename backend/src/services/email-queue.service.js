
import amqp from 'amqplib';

const QUEUE = 'snapclass.email';
const DEAD_QUEUE = 'snapclass.email.dead';

let connection;
let channel;
let connectionPromise;

async function getChannel() {
  if (channel) return channel;

  if (!connectionPromise) {
    connectionPromise = (async () => {
      const url = process.env.RABBITMQ_URL;

      if (!url) {
        throw new Error('RABBITMQ_URL is not configured.');
      }

      connection = await amqp.connect(url);
      channel = await connection.createConfirmChannel();

      await channel.assertQueue(QUEUE, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': DEAD_QUEUE,
        },
      });

      connection.on('error', (error) => {
        console.error('RabbitMQ connection error:', error.message);
      });

      connection.on('close', () => {
        connection = null;
        channel = null;
        connectionPromise = null;
      });

      return channel;
    })();
  }

  try {
    return await connectionPromise;
  } catch (error) {
    connectionPromise = null;
    throw error;
  }
}

export async function queueEmail(emailJob) {
  const currentChannel = await getChannel();

  const message = Buffer.from(JSON.stringify(emailJob));

  const accepted = currentChannel.sendToQueue(QUEUE, message, {
    persistent: true,
    contentType: 'application/json',
    timestamp: Date.now(),
  });

  // Respect channel backpressure.
  if (!accepted) {
    await new Promise((resolve, reject) => {
      currentChannel.once('drain', resolve);
      currentChannel.once('error', reject);
    });
  }

  // Wait for RabbitMQ's publisher confirmation, not SMTP delivery.
  await currentChannel.waitForConfirms();

  return { queued: true };
}

export async function queueOtpEmail({ email, otp, purpose }) {
  return queueEmail({
    type: 'OTP',
    email,
    otp,
    purpose,
  });
}

export async function queueAccountRemovalEmail({ email, fullName, role }) {
  return queueEmail({
    type: 'ACCOUNT_REMOVED',
    email,
    fullName,
    role,
  });
}
