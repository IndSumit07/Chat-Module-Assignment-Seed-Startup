import * as PresenceService from '../services/presence.service.js';
import { publish, channels } from '../services/pubsub.service.js';
import * as ConversationService from '../services/conversation.service.js';

/**
 * Presence Socket Handler — tracks online/offline status and active conversations.
 *
 * On connect:
 *   1. Set user online in Redis
 *   2. Register socket session
 *   3. Broadcast online status to all conversations the user is a member of
 *
 * On disconnect:
 *   1. Remove socket session
 *   2. If last session — set offline, broadcast
 *
 * Heartbeat flow:
 *   Client sends 'heartbeat' every 20s → refreshes Redis TTL to 35s
 *   If heartbeat stops → Redis auto-expires → user appears offline on next lookup
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export const registerPresenceHandlers = (io, socket) => {
  const userId = socket.user._id.toString();

  /** Broadcasts a presence change to all conversations the user belongs to */
  const broadcastPresence = async (status, lastSeen = null) => {
    const conversations = await ConversationService.getUserConversations(userId);
    const payload = { userId, status, lastSeen };

    await Promise.all([
      // Broadcast to the user's personal presence room (watched by conversation members)
      publish(channels.presence(userId), payload),
    ]);
  };

  // ── On connect: go online ────────────────────────────────────────────────────
  (async () => {
    try {
      await PresenceService.setUserOnline(userId, socket.id);
      await broadcastPresence('online');
    } catch (err) {
      console.error(`[Presence] Error setting user ${userId} online:`, err.message);
    }
  })();

  // ── heartbeat — refreshes the Redis TTL ─────────────────────────────────────
  socket.on('heartbeat', async () => {
    try {
      await PresenceService.heartbeat(userId);
    } catch { /* suppress */ }
  });

  // ── presence:get — fetch presence for a list of users ───────────────────────
  socket.on('presence:get', async ({ userIds }) => {
    try {
      if (!Array.isArray(userIds) || userIds.length === 0) return;
      const presenceMap = await PresenceService.getUsersPresence(userIds);
      socket.emit('presence:snapshot', { presenceMap });
    } catch (err) {
      socket.emit('error', { event: 'presence:get', message: err.message });
    }
  });

  // ── conversation:join — join a Socket.io room + track active conversation ────
  socket.on('conversation:join', async ({ conversationId }) => {
    try {
      if (!conversationId) return;

      const isMember = await ConversationService.isUserMember(conversationId, userId);
      if (!isMember) return;

      socket.join(conversationId);
      socket.activeConversationId = conversationId; // Stored for typing cleanup on disconnect

      await PresenceService.setActiveConversation(userId, conversationId);

    } catch (err) {
      socket.emit('error', { event: 'conversation:join', message: err.message });
    }
  });

  // ── conversation:leave — leave a room ───────────────────────────────────────
  socket.on('conversation:leave', async ({ conversationId }) => {
    try {
      if (!conversationId) return;
      socket.leave(conversationId);
      await PresenceService.clearActiveConversation(userId);
      socket.activeConversationId = null;
    } catch { /* suppress */ }
  });

  // ── On disconnect: go offline ────────────────────────────────────────────────
  socket.on('disconnect', async () => {
    try {
      const wentOffline = await PresenceService.setUserOffline(userId, socket.id);
      if (wentOffline) {
        await broadcastPresence('offline', new Date().toISOString());
      }
    } catch (err) {
      console.error(`[Presence] Error on disconnect for user ${userId}:`, err.message);
    }
  });
};
