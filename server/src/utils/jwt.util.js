import jwt from 'jsonwebtoken';
import env from '../configs/env.config.js';
import ApiError from './apiError.util.js';

/**
 * Signs a JWT access token with the user's ID as the payload.
 * Expiry is driven by JWT_EXPIRES_IN in the environment (default: 24h).
 *
 * @param {string} userId  The MongoDB user ID to embed in the token
 * @returns {string}       A signed JWT string
 */
export const signToken = (userId) => {
  return jwt.sign({ id: userId }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  });
};

/**
 * Verifies an incoming JWT and returns the decoded payload.
 * Throws a 401 ApiError if the token is invalid or expired.
 *
 * @param {string} token  The raw JWT string to verify
 * @returns {object}      The decoded payload (e.g. { id, iat, exp })
 */
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, env.jwt.secret);
  } catch (err) {
    throw new ApiError(401, 'Invalid or expired access token');
  }
};
