import asyncHandler from '../utils/asyncHandler.util.js';
import ApiError from '../utils/apiError.util.js';
import ApiResponse from '../utils/apiResponse.util.js';
import * as NotificationService from '../services/notification.service.js';
import * as CacheService from '../services/cache.service.js';

/**
 * GET /api/v1/notifications
 *
 * Returns a paginated list of notifications for the authenticated user.
 * Supports cursor-based pagination via ?cursor=<ISO timestamp>.
 */
export const getMyNotifications = asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();
  const { cursor, limit = 20 } = req.query;

  const [notifications, unreadCount] = await Promise.all([
    NotificationService.getUserNotifications(userId, parseInt(limit, 10), cursor || null),
    CacheService.getNotificationCount(userId) ??
      NotificationService.getUnreadCountFromDB(userId),
  ]);

  return res.status(200).json(
    new ApiResponse(200, 'Notifications fetched successfully.', {
      notifications,
      unreadCount,
    })
  );
});

/**
 * PATCH /api/v1/notifications/:id/read
 *
 * Marks a single notification as read and updates the Redis count.
 */
export const markRead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id.toString();

  const notification = await NotificationService.markNotificationRead(id, userId);
  if (!notification) throw new ApiError(404, 'Notification not found.');

  // Recalculate and refresh Redis count
  const freshCount = await NotificationService.getUnreadCountFromDB(userId);
  await CacheService.cacheNotificationCount(userId, freshCount);

  return res
    .status(200)
    .json(new ApiResponse(200, 'Notification marked as read.', { unreadCount: freshCount }));
});

/**
 * PATCH /api/v1/notifications/read-all
 *
 * Marks all unread notifications as read and resets the Redis count to 0.
 */
export const markAllRead = asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();

  await NotificationService.markAllRead(userId);
  await CacheService.resetNotificationCount(userId);

  return res
    .status(200)
    .json(new ApiResponse(200, 'All notifications marked as read.', { unreadCount: 0 }));
});
