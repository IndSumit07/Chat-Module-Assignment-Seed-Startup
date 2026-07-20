import * as NotificationService from '../services/notification.service.js';
import * as CacheService from '../services/cache.service.js';

/**
 * Notification Socket Handler — allows clients to mark notifications read
 * directly via the socket without making a REST call.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export const registerNotificationHandlers = (io, socket) => {
  const userId = socket.user._id.toString();

  // Join the user's personal notification room
  // This room is targeted by the notification worker via pub/sub
  socket.join(`user:${userId}`);

  // ── notification:read ────────────────────────────────────────────────────────
  socket.on('notification:read', async ({ notificationId }) => {
    try {
      if (!notificationId) return;

      await NotificationService.markNotificationRead(notificationId, userId);

      const freshCount = await NotificationService.getUnreadCountFromDB(userId);
      await CacheService.cacheNotificationCount(userId, freshCount);

      socket.emit('notification:count', { unreadCount: freshCount });

    } catch (err) {
      socket.emit('error', { event: 'notification:read', message: err.message });
    }
  });

  // ── notification:read-all ────────────────────────────────────────────────────
  socket.on('notification:read-all', async () => {
    try {
      await NotificationService.markAllRead(userId);
      await CacheService.resetNotificationCount(userId);

      socket.emit('notification:count', { unreadCount: 0 });

    } catch (err) {
      socket.emit('error', { event: 'notification:read-all', message: err.message });
    }
  });
};
