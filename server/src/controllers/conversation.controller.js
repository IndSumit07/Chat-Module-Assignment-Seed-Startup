import asyncHandler from '../utils/asyncHandler.util.js';
import ApiError from '../utils/apiError.util.js';
import ApiResponse from '../utils/apiResponse.util.js';
import * as ConversationService from '../services/conversation.service.js';
import * as CacheService from '../services/cache.service.js';
import { publish, channels } from '../services/pubsub.service.js';
import { rateLimitMiddleware } from '../services/ratelimit.service.js';

export const createConversationRateLimit = rateLimitMiddleware('createConversation');

/**
 * POST /api/v1/conversations
 *
 * Creates a new conversation. The authenticated user is automatically added
 * as the owner. For a DM (isGroup=false), checks for an existing DM first.
 */
export const createConversation = asyncHandler(async (req, res) => {
  const { name, icon, isGroup = false, memberIds = [] } = req.body;
  const creatorId = req.user._id;

  // ── DM path: prevent duplicate DM conversations ────────────────────────────
  if (!isGroup && memberIds.length === 1) {
    const existing = await ConversationService.findExistingDM(
      creatorId.toString(),
      memberIds[0]
    );
    if (existing) {
      return res
        .status(200)
        .json(new ApiResponse(200, 'Existing DM conversation found.', existing));
    }
  }

  // Build member list — creator is always owner
  const uniqueIds = [...new Set([creatorId.toString(), ...memberIds])];
  const members = uniqueIds.map((id) => ({
    userId: id,
    role: id === creatorId.toString() ? 'owner' : 'member',
    joinedAt: new Date(),
    lastReadAt: new Date(),
  }));

  // Auto-generate name from member count when not provided for a group
  const resolvedName = name?.trim() || (isGroup ? `Group (${members.length})` : undefined);

  const conversation = await ConversationService.createConversation({
    name: resolvedName,
    icon: icon || 'users',
    members,
    isGroup,
    createdBy: creatorId,
  });

  const populated = await ConversationService.findConversationById(conversation._id);

  return res
    .status(201)
    .json(new ApiResponse(201, 'Conversation created successfully.', populated));
});

/**
 * GET /api/v1/conversations
 *
 * Returns the authenticated user's conversation list with unread counts,
 * sorted by most recently active. Unread counts are served from Redis.
 */
export const getMyConversations = asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();

  const [conversations, unreadCounts] = await Promise.all([
    ConversationService.getUserConversations(userId),
    CacheService.getUnreadCounts(userId),
  ]);

  const data = conversations.map((conv) => ({
    ...conv.toObject(),
    unreadCount: unreadCounts[conv._id.toString()] || 0,
  }));

  return res
    .status(200)
    .json(new ApiResponse(200, 'Conversations fetched successfully.', data));
});

/**
 * GET /api/v1/conversations/:id
 *
 * Returns a single conversation. Checks membership before serving.
 * Tries the Redis cache before hitting MongoDB.
 */
export const getConversation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id.toString();

  const isMember = await ConversationService.isUserMember(id, userId);
  if (!isMember) {
    throw new ApiError(403, 'You are not a member of this conversation.');
  }

  const cached = await CacheService.getCachedConversation(id);
  if (cached) {
    return res
      .status(200)
      .json(new ApiResponse(200, 'Conversation fetched from cache.', cached));
  }

  const conversation = await ConversationService.findConversationById(id);
  if (!conversation) throw new ApiError(404, 'Conversation not found.');

  await CacheService.cacheConversation(id, conversation.toObject());

  return res
    .status(200)
    .json(new ApiResponse(200, 'Conversation fetched successfully.', conversation));
});

/**
 * PATCH /api/v1/conversations/:id
 *
 * Updates the conversation name or icon. Only owners and admins may do this.
 */
export const updateConversation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, icon } = req.body;
  const userId = req.user._id.toString();

  const conversation = await ConversationService.findConversationById(id);
  if (!conversation) throw new ApiError(404, 'Conversation not found.');

  const member = conversation.members.find(
    (m) => m.userId._id.toString() === userId
  );
  if (!member || !['owner', 'admin'].includes(member.role)) {
    throw new ApiError(403, 'Only owners and admins can update conversation settings.');
  }

  const updates = {};
  if (name !== undefined) updates.name = name.trim();
  if (icon !== undefined) updates.icon = icon;

  const updated = await ConversationService.updateConversationMeta(id, updates);

  await CacheService.invalidateConversation(id);

  // Broadcast the update to all conversation members
  await publish(channels.conversationUpdated(id), { conversation: updated });

  return res
    .status(200)
    .json(new ApiResponse(200, 'Conversation updated successfully.', updated));
});

/**
 * DELETE /api/v1/conversations/:id/leave
 *
 * Removes the authenticated user from the conversation.
 * If the user is the last member, the conversation should be cleaned up (future).
 */
export const leaveConversation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id.toString();

  const isMember = await ConversationService.isUserMember(id, userId);
  if (!isMember) {
    throw new ApiError(400, 'You are not a member of this conversation.');
  }

  const updated = await ConversationService.removeMember(id, userId);

  await CacheService.invalidateConversation(id);
  await publish(channels.conversationUpdated(id), { conversation: updated });

  return res
    .status(200)
    .json(new ApiResponse(200, 'You have left the conversation.'));
});

/**
 * DELETE /api/v1/conversations/:id
 *
 * Permanently deletes the conversation, its messages, attachments from S3, and invitations.
 * Only the owner can perform this action.
 */
export const deleteConversation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id.toString();

  const conversation = await ConversationService.findConversationById(id);
  if (!conversation) throw new ApiError(404, 'Conversation not found.');

  const member = conversation.members.find(
    (m) => m.userId._id.toString() === userId
  );
  if (!member || member.role !== 'owner') {
    throw new ApiError(403, 'Only the owner can delete the conversation.');
  }

  // Tell all clients that the conversation was deleted so they can route away
  await publish(channels.conversationDeleted(id), { conversationId: id });

  await ConversationService.deleteConversationFully(id);
  
  // Clean up cache
  await CacheService.invalidateConversation(id);
  await CacheService.invalidateRecentMessages(id);

  return res.status(200).json(new ApiResponse(200, 'Conversation deleted successfully.'));
});
