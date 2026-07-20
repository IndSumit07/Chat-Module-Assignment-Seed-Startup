import crypto from 'crypto';
import redis from '../configs/redis.config.js';

/** OTP time-to-live in seconds — 10 minutes */
const OTP_TTL_SECONDS = 10 * 60;

/**
 * Namespaced Redis key builders prevent collision between concurrent OTP flows.
 * e.g.  otp:register:user@email.com
 *        otp:login:user@email.com
 *        otp:reset:user@email.com
 */
const buildKey = (purpose, email) => `otp:${purpose}:${email.toLowerCase()}`;

/**
 * Generates a cryptographically random 6-digit numeric OTP.
 *
 * @returns {string}  Zero-padded 6-digit code, e.g. "042817"
 */
export const generateOtp = () => {
  const otp = crypto.randomInt(0, 1_000_000);
  return String(otp).padStart(6, '0');
};

/**
 * Stores an OTP in Redis under a namespaced key with an expiry window.
 *
 * @param {string} purpose  Flow identifier — 'register' | 'login' | 'reset'
 * @param {string} email    The target user's email
 * @param {string} otp      The generated OTP
 */
export const storeOtp = async (purpose, email, otp) => {
  const key = buildKey(purpose, email);
  await redis.set(key, otp, 'EX', OTP_TTL_SECONDS);
};

/**
 * Compares the submitted OTP against the value stored in Redis.
 * Returns true on a match; false when missing or mismatched.
 *
 * @param {string} purpose     Flow identifier
 * @param {string} email       The user's email
 * @param {string} submittedOtp  The OTP entered by the user
 * @returns {Promise<boolean>}
 */
export const verifyOtp = async (purpose, email, submittedOtp) => {
  const key = buildKey(purpose, email);
  const stored = await redis.get(key);
  return stored !== null && stored === submittedOtp;
};

/**
 * Deletes the OTP from Redis after it has been consumed.
 * Prevents replay attacks where the same OTP could be reused.
 *
 * @param {string} purpose  Flow identifier
 * @param {string} email    The user's email
 */
export const deleteOtp = async (purpose, email) => {
  const key = buildKey(purpose, email);
  await redis.del(key);
};
