import Redis from 'ioredis';
import env from '../configs/env.config.js';
import { getIO } from '../configs/socket.config.js';
import redis from '../configs/redis.config.js';

/**
 * Pub/Sub Service — bridges Redis pub/sub with Socket.io for cross-instance delivery.
 *
 * Architecture:
 *   Publisher  → redis.publish(channel, payload)
 *   Subscriber → dedicated ioredis connection, never used for regular commands
 *   On message → parse payload → emit to the correct Socket.io room or user
 *
 * Using a separate subscriber connection is required by ioredis because
 * a connection in subscribe mode cannot issue any other commands.
 */

// ── Dedicated subscriber connection ────────────────────────────────────────────
const subscriber = new Redis({
  host: env.redis.host,
  port: env.redis.port,
  ...(env.redis.password && { password: env.redis.password }),
  maxRetriesPerRequest: null,
});

subscriber.on('error', (err) =>
  console.error('[PubSub] Subscriber error:', err.message)
);

// ── Channel name builders ──────────────────────────────────────────────────────
export const channels = {
  message:              (convId) => `chat:message:${convId}`,
  messageEdited:        (convId) => `chat:message:edited:${convId}`,
  messageDeleted:       (convId) => `chat:message:deleted:${convId}`,
  typing:               (convId) => `chat:typing:${convId}`,
  read:                 (convId) => `chat:read:${convId}`,
  conversationUpdated:  (convId) => `conversation:updated:${convId}`,
  conversationDeleted:  (convId) => `conversation:deleted:${convId}`,
  invitation:           (userId) => `invitation:${userId}`,
  notification:         (userId) => `notification:${userId}`,
  presence:             (userId) => `presence:${userId}`,
};

// ── Publisher ──────────────────────────────────────────────────────────────────

/**
 * Publishes a payload to a Redis channel.
 * The subscriber connection on every server instance picks this up and
 * re-emits it via Socket.io to the correct clients.
 *
 * @param {string} channel  — One of the channels.* values
 * @param {object} payload  — Will be JSON-serialized
 */
export const publish = (channel, payload) =>
  redis.publish(channel, JSON.stringify(payload));

// ── Subscriber + Socket.io bridge ─────────────────────────────────────────────

/**
 * Bootstraps the pub/sub subscriber.
 * Must be called after Socket.io is initialized.
 * Subscribes to patterns and wires incoming messages to the correct socket rooms.
 */
export const initPubSub = async () => {
  // Subscribe to wildcard patterns using psubscribe
  await subscriber.psubscribe(
    'chat:message:*',
    'chat:typing:*',
    'chat:read:*',
    'conversation:updated:*',
    'conversation:deleted:*',
    'invitation:*',
    'notification:*',
    'presence:*'
  );

  subscriber.on('pmessage', (_pattern, channel, rawPayload) => {
    const io = getIO();
    let payload;

    try {
      payload = JSON.parse(rawPayload);
    } catch {
      console.error('[PubSub] Failed to parse payload on channel:', channel);
      return;
    }

    // ── Route messages to the correct Socket.io targets ──────────────────────

    // New message in a conversation room
    if (channel.startsWith('chat:message:edited:')) {
      const convId = channel.replace('chat:message:edited:', '');
      io.to(convId).emit('message:edited', payload);

    } else if (channel.startsWith('chat:message:deleted:')) {
      const convId = channel.replace('chat:message:deleted:', '');
      io.to(convId).emit('message:deleted', payload);

    } else if (channel.startsWith('chat:message:')) {
      const convId = channel.replace('chat:message:', '');
      io.to(convId).emit('message:new', payload);

    } else if (channel.startsWith('chat:typing:')) {
      const convId = channel.replace('chat:typing:', '');
      io.to(convId).emit('typing:update', payload);

    } else if (channel.startsWith('chat:read:')) {
      const convId = channel.replace('chat:read:', '');
      io.to(convId).emit('message:read', payload);

    } else if (channel.startsWith('conversation:updated:')) {
      const convId = channel.replace('conversation:updated:', '');
      io.to(convId).emit('conversation:updated', payload);

    } else if (channel.startsWith('conversation:deleted:')) {
      const convId = channel.replace('conversation:deleted:', '');
      io.to(convId).emit('conversation:deleted', payload);

    } else if (channel.startsWith('invitation:')) {
      const userId = channel.replace('invitation:', '');
      io.to(`user:${userId}`).emit('invitation:new', payload);

    } else if (channel.startsWith('notification:')) {
      const userId = channel.replace('notification:', '');
      io.to(`user:${userId}`).emit('notification:new', payload);

    } else if (channel.startsWith('presence:')) {
      // Presence is broadcast to the user's personal room — clients
      // can join the rooms of users they care about (e.g. conversation members)
      const userId = channel.replace('presence:', '');
      io.to(`presence:${userId}`).emit('presence:changed', payload);
    }
  });

  console.log('[PubSub] Redis pub/sub subscriber initialized');
};

export default subscriber;
