import { Queue } from 'bullmq';
import env from './env.config.js';

/**
 * Shared Redis connection options used by all BullMQ Queues and Workers.
 *
 * BullMQ requires its own ioredis connections — it cannot share the app's
 * main Redis client because it uses blocking commands internally.
 */
export const bullmqConnection = {
  host: env.redis.host,
  port: env.redis.port,
  ...(env.redis.password && { password: env.redis.password }),
  maxRetriesPerRequest: null, // Required by BullMQ
};

/** Queue names — single source of truth; imported by both producers and workers */
export const QUEUE_NAMES = {
  EMAIL:             'email',
  INVITATION_EMAIL:  'invitation-email',
  NOTIFICATION:      'notification',
};

/**
 * Shared default job options applied to all queues.
 * Individual producers can override these per-job using the add() options arg.
 */
const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000, // 5s → 10s → 20s
  },
  removeOnComplete: { count: 100 },
  removeOnFail:     { count: 200 },
};

/** OTP emails (registration, login 2FA, password reset) */
export const emailQueue = new Queue(QUEUE_NAMES.EMAIL, {
  connection: bullmqConnection,
  defaultJobOptions,
});

/** Conversation invitation emails with full HTML branding */
export const invitationEmailQueue = new Queue(QUEUE_NAMES.INVITATION_EMAIL, {
  connection: bullmqConnection,
  defaultJobOptions,
});

/** In-app notification creation and real-time delivery */
export const notificationQueue = new Queue(QUEUE_NAMES.NOTIFICATION, {
  connection: bullmqConnection,
  defaultJobOptions,
});

// Default export kept for backward compatibility with mail.service.js
export default emailQueue;

