import { s3Client, S3_BUCKET } from '../src/config/s3.js';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';

async function test() {
  try {
    const res = await s3Client.send(new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: 'subjects/5/materials/',
      MaxKeys: 5,
    }));
    console.log('LIST SUCCESS:', res.Contents);
  } catch (err) {
    console.log('LIST ERROR:', err.name, err.message);
  }
}

test();
