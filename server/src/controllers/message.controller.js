import asyncHandler from '../utils/asyncHandler.util.js';
import ApiError from '../utils/apiError.util.js';
import ApiResponse from '../utils/apiResponse.util.js';
import * as MessageService from '../services/message.service.js';
import * as ConversationService from '../services/conversation.service.js';
import * as CacheService from '../services/cache.service.js';
import { publish, channels } from '../services/pubsub.service.js';
import { rateLimitMiddleware } from '../services/ratelimit.service.js';

export const sendMessageRateLimit = rateLimitMiddleware('sendMessage');

/**
 * GET /api/v1/conversations/:id/messages
 *
 * Returns a cursor-paginated message history.
 * Serves from Redis recent-messages cache for the first page.
 * Falls back to MongoDB for older pages (cursor present).
 */
export const getMessages = asyncHandler(async (req, res) => {
  const { id: convId } = req.params;
  const { cursor, limit = 40 } = req.query;
  const userId = req.user._id.toString();

  const isMember = await ConversationService.isUserMember(convId, userId);
  if (!isMember) throw new ApiError(403, 'You are not a member of this conversation.');

  // Serve first page from cache when no cursor is provided
  if (!cursor) {
    const cached = await CacheService.getRecentMessages(convId);
    if (cached) {
      return res
        .status(200)
        .json(new ApiResponse(200, 'Messages fetched from cache.', { messages: cached, hasMore: true }));
    }
  }

  const messages = await MessageService.getMessages(convId, cursor || null, parseInt(limit, 10));
  const hasMore = messages.length === parseInt(limit, 10);

  // Populate the cache on the first page load
  if (!cursor && messages.length > 0) {
    await CacheService.cacheRecentMessages(convId, messages.map((m) => m.toObject()));
  }

  return res
    .status(200)
    .json(new ApiResponse(200, 'Messages fetched successfully.', { messages, hasMore }));
});

/**
 * POST /api/v1/conversations/:id/messages
 *
 * REST fallback for sending a message. Prefer the socket path (message:send)
 * for real-time delivery. This endpoint persists the message and broadcasts it.
 *
 * Rate limited: 30 messages per 10 seconds.
 */
export const sendMessage = asyncHandler(async (req, res) => {
  const { id: convId } = req.params;
  const { text, replyTo, tempId } = req.body;
  const userId = req.user._id.toString();

  if (!text?.trim()) throw new ApiError(400, 'Message text is required.');

  const isMember = await ConversationService.isUserMember(convId, userId);
  if (!isMember) throw new ApiError(403, 'You are not a member of this conversation.');

  const message = await MessageService.createMessage({
    conversationId: convId,
    sender: userId,
    text: text.trim(),
    replyTo: replyTo || undefined,
  });

  await message.populate('sender', 'username avatarUrl');

  const msgObj = message.toObject();

  // Update conversation activity + cache in parallel
  await Promise.all([
    ConversationService.updateConversationLastMessage(convId, message._id),
    CacheService.prependMessage(convId, msgObj),
    CacheService.invalidateConversation(convId),
  ]);

  // Broadcast to all conversation participants via pub/sub
  await publish(channels.message(convId), { message: msgObj, tempId });

  return res
    .status(201)
    .json(new ApiResponse(201, 'Message sent.', { message: msgObj }));
});

/**
 * PATCH /api/v1/messages/:id
 *
 * Edits the text of the authenticated user's own message.
 */
export const editMessage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;
  const userId = req.user._id.toString();

  if (!text?.trim()) throw new ApiError(400, 'New message text is required.');

  const message = await MessageService.findMessageById(id);
  if (!message) throw new ApiError(404, 'Message not found.');

  if (message.sender._id.toString() !== userId) {
    throw new ApiError(403, 'You can only edit your own messages.');
  }

  if (message.isDeleted) {
    throw new ApiError(400, 'Deleted messages cannot be edited.');
  }

  const updated = await MessageService.editMessage(id, text.trim());

  // Invalidate recent message cache and broadcast the edit
  await CacheService.invalidateRecentMessages(message.conversationId.toString());
  await publish(channels.messageEdited(message.conversationId.toString()), {
    messageId: id,
    text: text.trim(),
    conversationId: message.conversationId.toString(),
  });

  return res
    .status(200)
    .json(new ApiResponse(200, 'Message updated.', updated));
});

/**
 * DELETE /api/v1/messages/:id
 *
 * Soft-deletes the authenticated user's own message.
 * The document remains in the database; clients render a "deleted" placeholder.
 */
export const deleteMessage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id.toString();

  const message = await MessageService.findMessageById(id);
  if (!message) throw new ApiError(404, 'Message not found.');

  if (message.sender._id.toString() !== userId) {
    throw new ApiError(403, 'You can only delete your own messages.');
  }

  if (message.isDeleted) {
    throw new ApiError(400, 'Message is already deleted.');
  }

  await MessageService.softDeleteMessage(id);

  await CacheService.invalidateRecentMessages(message.conversationId.toString());
  await publish(channels.messageDeleted(message.conversationId.toString()), {
    messageId: id,
    conversationId: message.conversationId.toString(),
  });

  return res
    .status(200)
    .json(new ApiResponse(200, 'Message deleted.'));
});

/**
 * POST /api/v1/conversations/:id/read
 *
 * Marks all unread messages in the conversation as read for the authenticated user.
 * Resets the Redis unread count and updates the member's lastReadAt cursor.
 */
export const markConversationRead = asyncHandler(async (req, res) => {
  const { id: convId } = req.params;
  const userId = req.user._id.toString();

  const conversation = await ConversationService.findConversationById(convId);
  if (!conversation) throw new ApiError(404, 'Conversation not found.');

  const member = conversation.members.find((m) => m.userId._id.toString() === userId);
  if (!member) throw new ApiError(403, 'You are not a member of this conversation.');

  await Promise.all([
    MessageService.markConversationRead(convId, userId, member.lastReadAt),
    ConversationService.updateMemberLastRead(convId, userId),
    CacheService.resetUnreadCount(convId, userId),
  ]);

  // Broadcast read receipt to all conversation members
  await publish(channels.read(convId), {
    userId,
    conversationId: convId,
    lastReadAt: new Date().toISOString(),
  });

  return res
    .status(200)
    .json(new ApiResponse(200, 'Conversation marked as read.'));
});
