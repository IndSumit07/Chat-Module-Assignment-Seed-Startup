import redis from '../configs/redis.config.js';

/**
 * Typing Service — tracks who is typing in each conversation using Redis Sorted Sets.
 *
 * Key strategy:
 *   typing:{conversationId}  → Sorted Set where score = Unix timestamp (ms)
 *
 * A user is considered "currently typing" if their score is within the last 5 seconds.
 * Stale entries are lazily pruned on every read, keeping Redis clean.
 */

const TYPING_TTL_MS = 5000;  // 5 seconds — typing indicator expires if no new event
const KEY_TTL_S    = 30;     // Auto-expire the entire key after 30s of no activity

const key = (conversationId) => `typing:${conversationId}`;

/**
 * Marks a user as currently typing in a conversation.
 * Re-calling this resets their 5-second expiry window (debounce-friendly).
 *
 * @param {string} conversationId
 * @param {string} userId
 */
export const startTyping = async (conversationId, userId) => {
  const score = Date.now();
  await redis.zadd(key(conversationId), score, userId);
  await redis.expire(key(conversationId), KEY_TTL_S);
};

/**
 * Explicitly removes a user from the typing set (e.g. on message send or blur).
 *
 * @param {string} conversationId
 * @param {string} userId
 */
export const stopTyping = async (conversationId, userId) => {
  await redis.zrem(key(conversationId), userId);
};

/**
 * Returns the list of userIds currently typing in the conversation.
 * Lazily removes stale entries (older than 5 seconds) before returning.
 *
 * Order is by most-recently-started-typing (highest score first).
 *
 * @param {string} conversationId
 * @returns {Promise<string[]>}  Array of userIds, newest typer first
 */
export const getTypingUsers = async (conversationId) => {
  const staleThreshold = Date.now() - TYPING_TTL_MS;

  // Remove stale entries in the same round-trip
  await redis.zremrangebyscore(key(conversationId), '-inf', staleThreshold);

  // Return active typers sorted by most recent activity (descending score)
  const typers = await redis.zrevrangebyscore(
    key(conversationId),
    '+inf',
    staleThreshold + 1
  );

  return typers;
};

/**
 * Clears all typing indicators for a conversation.
 * Called when a conversation is deleted or all members leave.
 *
 * @param {string} conversationId
 */
export const clearTyping = (conversationId) =>
  redis.del(key(conversationId));
