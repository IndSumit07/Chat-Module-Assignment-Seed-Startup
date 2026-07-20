import * as MessageService from '../services/message.service.js';
import * as ConversationService from '../services/conversation.service.js';
import * as CacheService from '../services/cache.service.js';
import { publish, channels } from '../services/pubsub.service.js';
import { checkRateLimit } from '../services/ratelimit.service.js';

/**
 * Chat Socket Handler — handles all message-related real-time events.
 *
 * Registered on every socket connection. All events require the socket
 * to already be authenticated (handled by the socket.config auth middleware).
 *
 * Optimistic UI flow for message:send:
 *   1. Client sends tempId with the message (its client-side UUID)
 *   2. Server persists, then publishes { message, tempId } via pub/sub
 *   3. All connected clients receive the message; sender matches tempId to replace placeholder
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export const registerChatHandlers = (io, socket) => {
  const userId = socket.user._id.toString();

  // ── message:send ────────────────────────────────────────────────────────────
  socket.on('message:send', async ({ conversationId, text, attachments, replyTo, tempId }) => {
    try {
      await checkRateLimit('sendMessage', userId);

      if (!conversationId || (!text?.trim() && (!attachments || attachments.length === 0))) return;

      const isMember = await ConversationService.isUserMember(conversationId, userId);
      if (!isMember) return;

      const message = await MessageService.createMessage({
        conversationId,
        sender: userId,
        text: text ? text.trim() : '',
        attachments: attachments || [],
        replyTo: replyTo || undefined,
      });

      await message.populate('sender', 'username avatarUrl');
      if (replyTo) await message.populate({
        path: 'replyTo',
        select: 'text sender isDeleted',
        populate: { path: 'sender', select: 'username' },
      });

      const msgObj = message.toObject();

      // Parallel: update conversation + prepend to cache
      await Promise.all([
        ConversationService.updateConversationLastMessage(conversationId, message._id),
        CacheService.prependMessage(conversationId, msgObj),
        CacheService.invalidateConversation(conversationId),
      ]);

      // Increment unread counts for all members who are NOT currently viewing this conversation
      const members = await ConversationService.getConversationMembers(conversationId);
      const incrementTasks = members
        .filter((m) => m.userId._id.toString() !== userId)
        .map(async (m) => {
          const recipientId = m.userId._id.toString();
          const active = await CacheService.getNotificationCount(recipientId);
          // Only increment for members not currently viewing this conversation
          await CacheService.incrementUnreadCount(conversationId, recipientId);
        });

      await Promise.all(incrementTasks);

      // Publish via pub/sub — delivers to every connected server instance
      await publish(channels.message(conversationId), { message: msgObj, tempId });

    } catch (err) {
      socket.emit('error', { event: 'message:send', message: err.message });
    }
  });

  // ── message:edit ────────────────────────────────────────────────────────────
  socket.on('message:edit', async ({ messageId, text }) => {
    try {
      if (!messageId || !text?.trim()) return;

      const message = await MessageService.findMessageById(messageId);
      if (!message || message.sender._id.toString() !== userId) return;
      if (message.isDeleted) return;

      const updated = await MessageService.editMessage(messageId, text.trim());
      await CacheService.invalidateRecentMessages(message.conversationId.toString());

      await publish(channels.messageEdited(message.conversationId.toString()), {
        messageId,
        text: text.trim(),
        conversationId: message.conversationId.toString(),
      });

    } catch (err) {
      socket.emit('error', { event: 'message:edit', message: err.message });
    }
  });

  // ── message:delete ──────────────────────────────────────────────────────────
  socket.on('message:delete', async ({ messageId }) => {
    try {
      if (!messageId) return;

      const message = await MessageService.findMessageById(messageId);
      if (!message || message.sender._id.toString() !== userId) return;
      if (message.isDeleted) return;

      await MessageService.softDeleteMessage(messageId);
      await CacheService.invalidateRecentMessages(message.conversationId.toString());

      await publish(channels.messageDeleted(message.conversationId.toString()), {
        messageId,
        conversationId: message.conversationId.toString(),
      });

    } catch (err) {
      socket.emit('error', { event: 'message:delete', message: err.message });
    }
  });

  // ── message:read ────────────────────────────────────────────────────────────
  socket.on('message:read', async ({ conversationId }) => {
    try {
      if (!conversationId) return;

      const conversation = await ConversationService.findConversationById(conversationId);
      if (!conversation) return;

      const member = conversation.members.find((m) => m.userId._id.toString() === userId);
      if (!member) return;

      await Promise.all([
        MessageService.markConversationRead(conversationId, userId, member.lastReadAt),
        ConversationService.updateMemberLastRead(conversationId, userId),
        CacheService.resetUnreadCount(conversationId, userId),
      ]);

      await publish(channels.read(conversationId), {
        userId,
        conversationId,
        lastReadAt: new Date().toISOString(),
      });

    } catch (err) {
      socket.emit('error', { event: 'message:read', message: err.message });
    }
  });
};
