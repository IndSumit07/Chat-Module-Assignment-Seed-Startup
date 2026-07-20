import { Worker } from 'bullmq';
import { QUEUE_NAMES, bullmqConnection } from '../configs/queue.config.js';
import Notification from '../models/notification.model.js';
import { getIO } from '../configs/socket.config.js';
import {
  incrementNotificationCount,
  getNotificationCount,
} from '../services/cache.service.js';
import { channels, publish } from '../services/pubsub.service.js';

/**
 * Notification Worker — persists in-app notifications and delivers them in real time.
 *
 * Expected job data shape:
 * {
 *   recipientId: string    — target user ID
 *   type:        string    — 'invitation' | 'message' | 'system'
 *   title:       string    — short display title
 *   body:        string    — longer description
 *   data:        object    — type-specific context payload
 * }
 *
 * Processing steps:
 *   1. Persist the notification document to MongoDB
 *   2. Increment the Redis unread count cache
 *   3. Publish to Redis pub/sub → all server instances emit to the user's socket room
 */
const processNotificationJob = async (job) => {
  const { recipientId, type, title, body, data } = job.data;

  // 1. Persist notification
  const notification = await Notification.create({
    recipientId,
    type,
    title,
    body,
    data: data || {},
  });

  // 2. Update Redis notification count cache
  await incrementNotificationCount(recipientId);
  const unreadCount = (await getNotificationCount(recipientId)) ?? 0;

  // 3. Broadcast to all server instances via pub/sub
  await publish(channels.notification(recipientId), {
    notification: notification.toObject(),
    unreadCount,
  });

  console.log(
    `[NotificationWorker] Delivered ${type} notification to user ${recipientId}`
  );
};

const notificationWorker = new Worker(
  QUEUE_NAMES.NOTIFICATION,
  processNotificationJob,
  {
    connection: bullmqConnection,
    concurrency: 10, // Notifications are lightweight — higher concurrency is safe
  }
);

notificationWorker.on('completed', (job) => {
  console.log(
    `[NotificationWorker] Job ${job.id} completed → user ${job.data.recipientId}`
  );
});

notificationWorker.on('failed', (job, err) => {
  console.error(
    `[NotificationWorker] Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`
  );
});

notificationWorker.on('error', (err) => {
  console.error(`[NotificationWorker] Worker error: ${err.message}`);
});

export default notificationWorker;
