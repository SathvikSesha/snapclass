
import { Redis } from '@upstash/redis';
import 'dotenv/config';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  throw new Error('Upstash Redis configuration is missing.');
}

export const redis = new Redis({
  url,
  token,
});
