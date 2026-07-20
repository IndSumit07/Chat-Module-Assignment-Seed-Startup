import { Queue } from 'bullmq';
import env from './env.config.js';

/**
 * Shared Redis connection options used by BullMQ Queue and Worker.
 *
 * BullMQ requires its own ioredis connections — it cannot share the app's
 * main Redis client because it uses blocking commands internally.
 */
export const bullmqConnection = {
  host: env.redis.host,
  port: env.redis.port,
  ...(env.redis.password && { password: env.redis.password }),

  // BullMQ internally retries on disconnect — set a sane max delay
  maxRetriesPerRequest: null, // Required by BullMQ
};

/** The name of the queue — all email jobs are published here */
export const EMAIL_QUEUE_NAME = 'email';

/**
 * Email queue — producers (services) add jobs here.
 * The worker picks them up asynchronously in the background.
 *
 * Default job options:
 *   - attempts: 3   (retry up to 3 times on failure)
 *   - backoff: exponential starting at 5 seconds
 *   - removeOnComplete: keep last 100 completed jobs for inspection
 *   - removeOnFail: keep last 200 failed jobs for debugging
 */
const emailQueue = new Queue(EMAIL_QUEUE_NAME, {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s → 10s → 20s
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});

export default emailQueue;
