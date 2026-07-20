import Notification from '../models/notification.model.js';

/**
 * All MongoDB operations for notifications live here.
 */

/**
 * Creates a notification document directly (synchronous path).
 * Prefer the notificationQueue for non-blocking creation in request handlers.
 *
 * @param {object} data  — { recipientId, type, title, body, data? }
 * @returns {Promise<Document>}
 */
export const createNotification = (data) => Notification.create(data);

/**
 * Returns a paginated list of notifications for a user, newest first.
 * Includes both read and unread unless filtered by the caller.
 *
 * @param {string}  userId
 * @param {number}  limit   — Page size (default 20)
 * @param {string|null} cursor  — Pagination cursor (createdAt of last item)
 * @returns {Promise<Document[]>}
 */
export const getUserNotifications = (userId, limit = 20, cursor = null) => {
  const query = {
    recipientId: userId,
    ...(cursor && { createdAt: { $lt: new Date(cursor) } }),
  };

  return Notification.find(query)
    .sort({ createdAt: -1 })
    .limit(limit);
};

/**
 * Marks a single notification as read.
 *
 * @param {string} id      — Notification ID
 * @param {string} userId  — Must match recipientId for security
 * @returns {Promise<Document|null>}
 */
export const markNotificationRead = (id, userId) =>
  Notification.findOneAndUpdate(
    { _id: id, recipientId: userId },
    { $set: { isRead: true, readAt: new Date() } },
    { returnDocument: 'after' }
  );

/**
 * Bulk-marks all of a user's unread notifications as read.
 *
 * @param {string} userId
 * @returns {Promise<import('mongoose').UpdateWriteOpResult>}
 */
export const markAllRead = (userId) =>
  Notification.updateMany(
    { recipientId: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

/**
 * Returns the count of unread notifications directly from MongoDB.
 * Used as a fallback when the Redis counter is unavailable.
 *
 * @param {string} userId
 * @returns {Promise<number>}
 */
export const getUnreadCountFromDB = (userId) =>
  Notification.countDocuments({ recipientId: userId, isRead: false });
