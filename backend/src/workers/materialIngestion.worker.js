
import amqp from 'amqplib';
import { GetObjectCommand } from '@aws-sdk/client-s3';

import { s3Client, S3_BUCKET } from '../config/s3.js';
import { ingestMaterial } from '../services/ai-client.service.js';

import * as ingestionRepository from '../repositories/materialIngestion.repository.js';

const QUEUE = 'snapclass.material.ingestion';
const RETRY_QUEUE = 'snapclass.material.ingestion.retry';
const DEAD_QUEUE = 'snapclass.material.ingestion.dead';

const MAX_RETRIES = 3;

const AI_SUPPORTED_EXTENSIONS = new Set([
  '.pdf',
  '.docx',
  '.pptx',
]);

async function downloadMaterial(objectKey) {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: objectKey,
    })
  );

  if (!response.Body) {
    throw new Error('S3 returned an empty file body.');
  }

  const bytes = await response.Body.transformToByteArray();

  return Buffer.from(bytes);
}

async function processMaterial(job) {
  const materialId = Number(job.materialId);

  if (!Number.isSafeInteger(materialId) || materialId <= 0) {
    throw new Error('Invalid material ID in ingestion job.');
  }

  const material =
    await ingestionRepository.getMaterialForIngestion(materialId);

  if (!material) {
    throw new Error(`Material ${materialId} was not found.`);
  }

  if (material.status !== 'AVAILABLE') {
    throw new Error(`Material ${materialId} is not available.`);
  }

  if (material.ingestionStatus === 'COMPLETED') {
    return { skipped: true };
  }

  const extension = material.originalFilename
    .split('.')
    .pop()
    ?.toLowerCase();

  if (
    !AI_SUPPORTED_EXTENSIONS.has(`.${extension}`)
  ) {
    await ingestionRepository.markIngestionFailed(
      materialId,
      'AI ingestion currently supports PDF, DOCX and PPTX only.'
    );

    return { skipped: true };
  }

  const claimed =
    await ingestionRepository.markIngestionProcessing(materialId);

  if (!claimed) {
    return { skipped: true };
  }

  const buffer = await downloadMaterial(material.objectKey);

  if (buffer.length !== Number(material.fileSize)) {
    throw new Error('Downloaded S3 file size does not match database record.');
  }

  const result = await ingestMaterial({
    buffer,
    filename: material.originalFilename,
    fileType: material.fileType,
    subjectId: material.subjectId,
    documentId: material.materialId,
  });

  await ingestionRepository.markIngestionCompleted(materialId);

  return {
    skipped: false,
    chunks: result.total_chunks,
  };
}

async function startWorker() {
  const url = process.env.RABBITMQ_URL;

  if (!url) {
    throw new Error('RABBITMQ_URL is not configured.');
  }

  const connection = await amqp.connect(url);
  const channel = await connection.createConfirmChannel();

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

  channel.prefetch(1);

  console.log('SnapClass material ingestion worker is running...');

  await channel.consume(QUEUE, async (message) => {
    if (!message) return;

    let job;

    try {
      job = JSON.parse(message.content.toString());

      if (job.type !== 'MATERIAL_INGESTION') {
        throw new Error('Unsupported material queue job type.');
      }

      const result = await processMaterial(job);

      channel.ack(message);

      if (result.skipped) {
        console.log(`Material ${job.materialId}: skipped.`);
      } else {
        console.log(
          `Material ${job.materialId} ingested successfully.`
        );
      }
    } catch (error) {
      console.error('Material ingestion failed:', error.message);

      const previousRetries = Number(
        message.properties.headers?.['x-retry-count'] || 0
      );

      const materialId = Number(job?.materialId);

      if (previousRetries < MAX_RETRIES) {
        try {
          if (Number.isSafeInteger(materialId) && materialId > 0) {
            await ingestionRepository.markIngestionRetryQueued(materialId);
          }

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

          console.log(
            `Material queued for retry ${previousRetries + 1}.`
          );
        } catch (publishError) {
          console.error('Could not publish retry:', publishError.message);
          channel.nack(message, false, true);
        }
      } else {
        try {
          if (Number.isSafeInteger(materialId) && materialId > 0) {
            await ingestionRepository.markIngestionFailed(
              materialId,
              error.message
            );
          }

          channel.sendToQueue(DEAD_QUEUE, message.content, {
            persistent: true,
            contentType: 'application/json',
            headers: {
              ...message.properties.headers,
              'x-retry-count': previousRetries,
              'x-failure-reason': error.message.slice(0, 1000),
            },
          });

          await channel.waitForConfirms();
          channel.ack(message);

          console.error('Material moved to dead-letter queue.');
        } catch (publishError) {
          console.error(
            'Could not publish dead letter:',
            publishError.message
          );

          channel.nack(message, false, true);
        }
      }
    }
  });

  connection.on('error', (error) => {
    console.error('Material worker connection error:', error.message);
  });

  connection.on('close', () => {
    console.error('Material worker connection closed.');
    process.exit(1);
  });
}

startWorker().catch((error) => {
  console.error('Could not start material ingestion worker:', error);
  process.exit(1);
});
