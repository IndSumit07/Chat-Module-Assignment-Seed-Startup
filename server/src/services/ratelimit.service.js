import redis from '../configs/redis.config.js';
import ApiError from '../utils/apiError.util.js';

/**
 * Rate Limit Service — sliding window rate limiter backed by Redis.
 *
 * Uses a Redis Sorted Set per (action, identifier) pair.
 * Each entry's score is the Unix timestamp in milliseconds.
 * On every check: stale entries are pruned → count checked → new entry added.
 *
 * This approach is fair (no sharp window resets) and accurate across restarts.
 *
 * Key strategy:
 *   ratelimit:{action}:{identifier}  → Sorted Set (score = timestamp ms)
 */

/**
 * Pre-configured rate limit policies.
 * limit:  maximum allowed events in the window
 * window: rolling window duration in milliseconds
 */
const POLICIES = {
  sendMessage:      { limit: 30,  window: 10_000  }, // 30 per 10s
  createConversation: { limit: 5, window: 60_000  }, // 5 per minute
  sendInvitation:   { limit: 10,  window: 60_000  }, // 10 per minute
  typing:           { limit: 20,  window: 5_000   }, // 20 per 5s
  auth:             { limit: 10,  window: 900_000 }, // 10 per 15min
  api:              { limit: 100, window: 60_000  }, // 100 per minute
};

/**
 * Checks and records a rate limit hit for the given action and identifier.
 * Throws a 429 ApiError if the limit is exceeded.
 *
 * @param {string} action      — One of the POLICIES keys
 * @param {string} identifier  — Unique key (e.g. userId, IP address)
 * @throws {ApiError} 429 when the limit is exceeded
 */
export const checkRateLimit = async (action, identifier) => {
  const policy = POLICIES[action];
  if (!policy) return; // Unknown actions are not rate-limited

  const key = `ratelimit:${action}:${identifier}`;
  const now = Date.now();
  const windowStart = now - policy.window;

  try {
    // Atomic pipeline: prune stale → count → record
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, '-inf', windowStart);
    pipeline.zcard(key);
    pipeline.zadd(key, now, `${now}-${Math.random()}`); // Unique member to allow same-ms entries
    pipeline.expire(key, Math.ceil(policy.window / 1000) + 5);

    const results = await pipeline.exec();
    const count = results[1][1]; // Current count after pruning (before adding this request)

    if (count >= policy.limit) {
      throw new ApiError(
        429,
        `Too many ${action} requests. Please slow down and try again shortly.`
      );
    }
  } catch (err) {
    // Re-throw 429s — they are intentional rate limit enforcements
    if (err instanceof ApiError && err.statusCode === 429) throw err;
    // For any other error (Redis unavailable etc.), fail-open with a warning
    console.warn(`[RateLimit] Redis unavailable for action "${action}" — allowing request: ${err.message}`);
  }
};

/**
 * Express middleware factory — applies a named rate limit policy to a route.
 * Uses the authenticated user's ID when available, falls back to IP address.
 *
 * @param {string} action — Policy name from POLICIES
 * @returns {Function}    Express middleware
 */
export const rateLimitMiddleware = (action) => async (req, res, next) => {
  const identifier = req.user?._id?.toString() || req.ip;
  try {
    await checkRateLimit(action, identifier);
    next();
  } catch (err) {
    next(err);
  }
};
