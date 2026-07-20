import redis from '../configs/redis.config.js';

/**
 * Presence Service — manages real-time user status using Redis.
 *
 * Key strategy:
 *   presence:status:{userId}    → 'online' | 'offline'  (STRING, TTL 35s)
 *   presence:lastseen:{userId}  → ISO timestamp          (STRING, persistent)
 *   sessions:{userId}           → Set of active socketIds
 *   presence:active:{userId}    → conversationId being viewed (STRING, TTL 1h)
 *
 * Heartbeat flow:
 *   Client emits 'heartbeat' every 20s → refreshes TTL to 35s.
 *   If heartbeat stops, Redis auto-expires the key → user appears offline.
 */

const ONLINE_TTL = 35;          // Seconds; must be > client heartbeat interval (20s)
const ACTIVE_CONV_TTL = 3600;   // 1 hour

const keys = {
  status: (userId) => `presence:status:${userId}`,
  lastSeen: (userId) => `presence:lastseen:${userId}`,
  sessions: (userId) => `sessions:${userId}`,
  activeConv: (userId) => `presence:active:${userId}`,
};

/**
 * Marks a user as online and registers their socket session.
 * Refreshes the TTL on subsequent calls (handles multiple tabs).
 *
 * @param {string} userId
 * @param {string} socketId
 */
export const setUserOnline = async (userId, socketId) => {
  await Promise.all([
    redis.set(keys.status(userId), 'online', 'EX', ONLINE_TTL),
    redis.sadd(keys.sessions(userId), socketId),
  ]);
};

/**
 * Removes a socket session. If no sessions remain, marks user as offline
 * and records their last-seen timestamp.
 *
 * @param {string} userId
 * @param {string} socketId
 * @returns {Promise<boolean>} true if the user went fully offline
 */
export const setUserOffline = async (userId, socketId) => {
  await redis.srem(keys.sessions(userId), socketId);

  const remaining = await redis.scard(keys.sessions(userId));
  if (remaining === 0) {
    const now = new Date().toISOString();
    await Promise.all([
      redis.del(keys.status(userId)),
      redis.set(keys.lastSeen(userId), now),
    ]);
    return true; // Fully offline — caller should broadcast presence change
  }
  return false; // Still has active sessions on other tabs/devices
};

/**
 * Refreshes the online TTL for a user (called on heartbeat).
 *
 * @param {string} userId
 */
export const heartbeat = (userId) =>
  redis.expire(keys.status(userId), ONLINE_TTL);

/**
 * Returns the presence state for a single user.
 *
 * @param {string} userId
 * @returns {Promise<{ status: 'online'|'offline', lastSeen: string|null, sessionCount: number }>}
 */
export const getUserPresence = async (userId) => {
  const [status, lastSeen, sessionCount] = await Promise.all([
    redis.get(keys.status(userId)),
    redis.get(keys.lastSeen(userId)),
    redis.scard(keys.sessions(userId)),
  ]);

  return {
    status: status === 'online' ? 'online' : 'offline',
    lastSeen: lastSeen || null,
    sessionCount,
  };
};

/**
 * Batch presence lookup — returns a map of userId → presence object.
 *
 * @param {string[]} userIds
 * @returns {Promise<Record<string, { status, lastSeen, sessionCount }>>}
 */
export const getUsersPresence = async (userIds) => {
  const results = await Promise.all(userIds.map(getUserPresence));
  return Object.fromEntries(userIds.map((id, i) => [id, results[i]]));
};

/**
 * Records which conversation a user is currently viewing.
 * Used to auto-mark messages as read and reduce notification noise.
 *
 * @param {string} userId
 * @param {string} conversationId
 */
export const setActiveConversation = (userId, conversationId) =>
  redis.set(keys.activeConv(userId), conversationId, 'EX', ACTIVE_CONV_TTL);

/**
 * Clears the user's active conversation (e.g. when they navigate away).
 *
 * @param {string} userId
 */
export const clearActiveConversation = (userId) =>
  redis.del(keys.activeConv(userId));

/**
 * Returns the conversationId the user is currently viewing, or null.
 *
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
export const getActiveConversation = (userId) =>
  redis.get(keys.activeConv(userId));

/**
 * Returns all active socketIds for a user (across all devices/tabs).
 *
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
export const getSocketSessions = (userId) =>
  redis.smembers(keys.sessions(userId));
