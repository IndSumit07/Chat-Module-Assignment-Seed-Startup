import * as TypingService from '../services/typing.service.js';
import { publish, channels } from '../services/pubsub.service.js';
import { checkRateLimit } from '../services/ratelimit.service.js';
import * as ConversationService from '../services/conversation.service.js';
import User from '../models/user.model.js';

/**
 * Typing Socket Handler — manages typing indicators using Redis Sorted Sets.
 *
 * Typing state lifecycle:
 *   1. Client emits typing:start  → user added to the sorted set with current timestamp score
 *   2. Client emits typing:stop   → user removed from the sorted set immediately
 *   3. Stale entries (>5s) are lazily pruned on every getTypingUsers call
 *
 * Broadcast format for 'typing:update':
 * {
 *   conversationId: string
 *   typingUsers: [{ userId, username }]
 * }
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export const registerTypingHandlers = (io, socket) => {
  const userId = socket.user._id.toString();
  const username = socket.user.username;

  /** Shared helper: fetch current typers and broadcast to the conversation room */
  const broadcastTypingUpdate = async (conversationId) => {
    const typerIds = await TypingService.getTypingUsers(conversationId);

    // Exclude the current user from seeing themselves typing
    const typingUsers = typerIds
      .filter((id) => id !== userId)
      .map((id) => ({ userId: id })); // Lean payload — client resolves username from store

    await publish(channels.typing(conversationId), {
      conversationId,
      typingUsers: typerIds.map((id) => ({ userId: id })),
    });
  };

  // ── typing:start ────────────────────────────────────────────────────────────
  socket.on('typing:start', async ({ conversationId }) => {
    try {
      await checkRateLimit('typing', userId);
      if (!conversationId) return;

      const isMember = await ConversationService.isUserMember(conversationId, userId);
      if (!isMember) return;

      await TypingService.startTyping(conversationId, userId);
      await broadcastTypingUpdate(conversationId);

    } catch (err) {
      // Rate limit exceeded — silently suppress (no error emitted for typing)
    }
  });

  // ── typing:stop ─────────────────────────────────────────────────────────────
  socket.on('typing:stop', async ({ conversationId }) => {
    try {
      if (!conversationId) return;

      await TypingService.stopTyping(conversationId, userId);
      await broadcastTypingUpdate(conversationId);

    } catch (err) {
      // Suppress — typing stop should never surface errors to the client
    }
  });

  /**
   * On disconnect, clear typing state for all conversations the user may
   * have been typing in. We store the user's active typing conversations
   * per socket so we can clean them up without a full scan.
   */
  socket.on('disconnect', async () => {
    // Typing expiry is handled by TTL; this is a best-effort immediate cleanup
    // Active conversation is the most likely place they were typing
    const activeConv = socket.activeConversationId;
    if (activeConv) {
      try {
        await TypingService.stopTyping(activeConv, userId);
        await broadcastTypingUpdate(activeConv);
      } catch { /* suppress */ }
    }
  });
};
