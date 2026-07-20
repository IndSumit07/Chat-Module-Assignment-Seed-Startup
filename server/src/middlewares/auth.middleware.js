import { verifyToken } from '../utils/jwt.util.js';
import { findUserById } from '../services/auth.service.js';
import ApiError from '../utils/apiError.util.js';
import asyncHandler from '../utils/asyncHandler.util.js';

/**
 * authenticate — protects routes that require a valid session.
 *
 * Reads the access token from one of two places (in priority order):
 *   1. Authorization header:  "Bearer <token>"
 *   2. httpOnly cookie:       accessToken=<token>
 *
 * On success, attaches the full user document to req.user and continues.
 * On failure, throws a 401 ApiError which the global error handler serialises.
 */
export const authenticate = asyncHandler(async (req, res, next) => {
  // Extract token from Authorization header or cookie
  let token = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    throw new ApiError(401, 'Access token is required. Please log in.');
  }

  // Verify signature and expiry — throws 401 if invalid
  const decoded = verifyToken(token);

  // Confirm the user still exists in the database
  const user = await findUserById(decoded.id);
  if (!user) {
    throw new ApiError(401, 'The user belonging to this token no longer exists.');
  }

  // Only fully verified accounts may access protected routes
  if (!user.isVerified) {
    throw new ApiError(403, 'Please verify your email before accessing this resource.');
  }

  req.user = user;
  next();
});
