
import amqp from 'amqplib';

const QUEUE = 'snapclass.material.ingestion';
const RETRY_QUEUE = 'snapclass.material.ingestion.retry';
const DEAD_QUEUE = 'snapclass.material.ingestion.dead';

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

      connection.on('error', (error) => {
        console.error('Material queue connection error:', error.message);
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

export async function queueMaterialIngestion({
  materialId,
  subjectId,
}) {
  const currentChannel = await getChannel();

  const message = Buffer.from(
    JSON.stringify({
      type: 'MATERIAL_INGESTION',
      materialId,
      subjectId,
      queuedAt: new Date().toISOString(),
    })
  );

  const accepted = currentChannel.sendToQueue(QUEUE, message, {
    persistent: true,
    contentType: 'application/json',
    timestamp: Date.now(),
  });

  if (!accepted) {
    await new Promise((resolve, reject) => {
      currentChannel.once('drain', resolve);
      currentChannel.once('error', reject);
    });
  }

  await currentChannel.waitForConfirms();

  return { queued: true };
}
