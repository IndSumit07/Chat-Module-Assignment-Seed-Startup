import { S3Client } from '@aws-sdk/client-s3';
import env from './env.config.js';

const s3Client = new S3Client({
  region: env.s3.region,
  credentials: {
    accessKeyId: env.s3.accessKeyId,
    secretAccessKey: env.s3.secretAccessKey,
  },
});

export const s3BucketName = env.s3.bucketName;
export default s3Client;
