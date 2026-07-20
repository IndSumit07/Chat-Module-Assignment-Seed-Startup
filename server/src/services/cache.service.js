import redis from '../configs/redis.config.js';

/**
 * Cache Service — general-purpose Redis cache with namespaced keys.
 *
 * All serialization (JSON.stringify / JSON.parse) is handled internally
 * so callers always work with plain JS objects.
 *
 * Key namespaces:
 *   conv:{id}               → Conversation metadata (STRING/JSON, TTL 1h)
 *   msgs:{convId}           → Recent messages list (LIST, TTL 30min)
 *   unread:{userId}         → Hash of convId → unread count
 *   notify:count:{userId}   → Unread notification count (STRING)
 */

const TTL = {
  CONVERSATION:   60 * 60,       // 1 hour
  MESSAGES:       30 * 60,       // 30 minutes
  NOTIFICATION:   24 * 60 * 60,  // 24 hours
};

const RECENT_MESSAGES_LIMIT = 50; // Messages to keep in the hot cache

const keys = {
  conversation:       (id)     => `conv:${id}`,
  messages:           (convId) => `msgs:${convId}`,
  unread:             (userId) => `unread:${userId}`,
  notifyCount:        (userId) => `notify:count:${userId}`,
};

// ─── Conversation Cache ────────────────────────────────────────────────────────

/**
 * Stores a conversation object in Redis.
 *
 * @param {string} convId
 * @param {object} data  — Plain JS conversation object
 */
export const cacheConversation = (convId, data) =>
  redis.set(keys.conversation(convId), JSON.stringify(data), 'EX', TTL.CONVERSATION);

/**
 * Returns the cached conversation, or null on a cache miss.
 *
 * @param {string} convId
 * @returns {Promise<object|null>}
 */
export const getCachedConversation = async (convId) => {
  const raw = await redis.get(keys.conversation(convId));
  return raw ? JSON.parse(raw) : null;
};

/**
 * Removes a conversation from cache — call on any mutation (rename, member change, etc.).
 *
 * @param {string} convId
 */
export const invalidateConversation = (convId) =>
  redis.del(keys.conversation(convId));

// ─── Recent Messages Cache ─────────────────────────────────────────────────────

/**
 * Replaces the recent messages cache for a conversation with the given array.
 * Stores messages in reverse-chronological order (newest at index 0).
 *
 * @param {string} convId
 * @param {object[]} messages  — Array of serializable message objects (newest first)
 */
export const cacheRecentMessages = async (convId, messages) => {
  const k = keys.messages(convId);
  const pipeline = redis.pipeline();
  pipeline.del(k);
  for (const msg of messages) {
    pipeline.rpush(k, JSON.stringify(msg));
  }
  pipeline.expire(k, TTL.MESSAGES);
  await pipeline.exec();
};

/**
 * Prepends a single new message to the front of the recent messages list.
 * Trims to the configured limit to prevent unbounded growth.
 *
 * @param {string} convId
 * @param {object} message  — The new message object
 */
export const prependMessage = async (convId, message) => {
  const k = keys.messages(convId);
  await redis.lpush(k, JSON.stringify(message));
  await redis.ltrim(k, 0, RECENT_MESSAGES_LIMIT - 1);
  await redis.expire(k, TTL.MESSAGES);
};

/**
 * Returns the cached recent messages (newest first), or null on a miss.
 *
 * @param {string} convId
 * @returns {Promise<object[]|null>}
 */
export const getRecentMessages = async (convId) => {
  const k = keys.messages(convId);
  const exists = await redis.exists(k);
  if (!exists) return null;

  const raw = await redis.lrange(k, 0, -1);
  return raw.map((r) => JSON.parse(r));
};

/**
 * Removes the recent messages cache — call on edit, delete, or after DB sync.
 *
 * @param {string} convId
 */
export const invalidateRecentMessages = (convId) =>
  redis.del(keys.messages(convId));

// ─── Unread Message Counters ───────────────────────────────────────────────────

/**
 * Atomically increments the unread count for a specific conversation/user pair.
 *
 * @param {string} convId
 * @param {string} userId
 */
export const incrementUnreadCount = (convId, userId) =>
  redis.hincrby(keys.unread(userId), convId, 1);

/**
 * Resets the unread count to 0 when a user opens/reads a conversation.
 *
 * @param {string} convId
 * @param {string} userId
 */
export const resetUnreadCount = (convId, userId) =>
  redis.hset(keys.unread(userId), convId, 0);

/**
 * Returns the full map of conversationId → unread count for a user.
 * All counts are returned as integers (Redis stores them as strings).
 *
 * @param {string} userId
 * @returns {Promise<Record<string, number>>}
 */
export const getUnreadCounts = async (userId) => {
  const raw = await redis.hgetall(keys.unread(userId));
  if (!raw) return {};
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, parseInt(v, 10)])
  );
};

// ─── Notification Count Cache ──────────────────────────────────────────────────

/**
 * Caches the total unread notification count for a user.
 *
 * @param {string} userId
 * @param {number} count
 */
export const cacheNotificationCount = (userId, count) =>
  redis.set(keys.notifyCount(userId), count, 'EX', TTL.NOTIFICATION);

/**
 * Atomically increments the cached notification count by 1.
 *
 * @param {string} userId
 */
export const incrementNotificationCount = (userId) =>
  redis.incr(keys.notifyCount(userId));

/**
 * Resets the notification count to 0 (e.g. user opened notification center).
 *
 * @param {string} userId
 */
export const resetNotificationCount = (userId) =>
  redis.set(keys.notifyCount(userId), 0, 'EX', TTL.NOTIFICATION);

/**
 * Returns the current unread notification count, or null on a cache miss.
 *
 * @param {string} userId
 * @returns {Promise<number|null>}
 */
export const getNotificationCount = async (userId) => {
  const raw = await redis.get(keys.notifyCount(userId));
  return raw !== null ? parseInt(raw, 10) : null;
};
