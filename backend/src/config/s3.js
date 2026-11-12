import { S3Client } from '@aws-sdk/client-s3';
import { env } from './env.js';

if (
  !env.aws.region ||
  !env.aws.accessKeyId ||
  !env.aws.secretAccessKey ||
  !env.aws.s3Bucket
) {
  throw new Error('AWS S3 environment variables are missing');
}

export const s3Client = new S3Client({
  region: env.aws.region,

  credentials: {
    accessKeyId: env.aws.accessKeyId,
    secretAccessKey: env.aws.secretAccessKey,
  },
});

export const S3_BUCKET = env.aws.s3Bucket;