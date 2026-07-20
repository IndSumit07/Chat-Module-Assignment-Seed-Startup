import bcrypt from 'bcryptjs';
import asyncHandler from '../utils/asyncHandler.util.js';
import ApiError from '../utils/apiError.util.js';
import ApiResponse from '../utils/apiResponse.util.js';
import { signToken } from '../utils/jwt.util.js';
import * as AuthService from '../services/auth.service.js';
import * as OtpService from '../services/otp.service.js';
import { sendOtpEmail } from '../services/mail.service.js';

/** Cookie options shared by all access token writes */
const ACCESS_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,               // Inaccessible to client-side JS — guards against XSS
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
  maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
};

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /auth/register
 *
 * Creates an unverified account and sends a 6-digit OTP to the user's email.
 *
 * Smart re-registration logic:
 *   - If the email exists but is NOT yet verified → delete the stale record
 *     and recreate it, then send a fresh OTP. No "already exists" error shown.
 *   - If the email IS verified → return a clear "user already exists" error.
 */
export const register = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    throw new ApiError(400, 'Username, email, and password are required.');
  }

  const existing = await AuthService.findUserByEmail(email);

  if (existing) {
    if (existing.isVerified) {
      // Verified account — do not allow re-registration with this email
      throw new ApiError(409, 'An account with this email already exists. Please log in.');
    }
    // Unverified stale account — silently clean up and let the user try again
    await AuthService.deleteUserByEmail(email);
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await AuthService.createUser({
    username: username.trim(),
    email: email.toLowerCase().trim(),
    password: hashedPassword,
  });

  // Generate and store OTP, then dispatch the welcome / verify email
  const otp = OtpService.generateOtp();
  await OtpService.storeOtp('register', email, otp);
  await sendOtpEmail(email, username, otp, 'register');

  return res.status(201).json(
    new ApiResponse(201, 'Registration successful. Please check your email for the verification OTP.')
  );
});

/**
 * POST /auth/verify-otp
 *
 * Confirms the registration OTP and marks the user account as verified.
 */
export const verifyRegisterOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    throw new ApiError(400, 'Email and OTP are required.');
  }

  const isValid = await OtpService.verifyOtp('register', email, otp);
  if (!isValid) {
    throw new ApiError(400, 'Invalid or expired OTP. Please request a new one.');
  }

  const user = await AuthService.findUserByEmail(email);
  if (!user) {
    throw new ApiError(404, 'User not found. Please register again.');
  }

  await AuthService.markUserVerified(user._id);
  await OtpService.deleteOtp('register', email); // Consume OTP — prevent replay attacks

  return res.status(200).json(
    new ApiResponse(200, 'Email verified successfully. You can now log in.')
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /auth/login
 *
 * Authenticates with email + password.
 *   - If 2FA is enabled for this account → sends an OTP and returns a pending
 *     indicator so the client knows to show the OTP input screen.
 *   - If 2FA is disabled → issues a JWT immediately and sets the cookie.
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, 'Email and password are required.');
  }

  // Fetch user with password field explicitly included
  const user = await AuthService.findUserByEmail(email).select('+password');
  if (!user) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  if (!user.isVerified) {
    throw new ApiError(403, 'Please verify your email before logging in.');
  }

  const isPasswordCorrect = await bcrypt.compare(password, user.password);
  if (!isPasswordCorrect) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  // ── Two-Factor Authentication path ─────────────────────────────────────────
  if (user.twoFactorEnabled) {
    const otp = OtpService.generateOtp();
    await OtpService.storeOtp('login', email, otp);
    await sendOtpEmail(email, user.username, otp, 'login');

    return res.status(200).json(
      new ApiResponse(200, 'OTP sent to your email. Please verify to complete login.', {
        requires2FA: true,
        email,
      })
    );
  }

  // ── Standard login path ────────────────────────────────────────────────────
  const token = signToken(user._id);

  return res
    .status(200)
    .cookie('accessToken', token, ACCESS_TOKEN_COOKIE_OPTIONS)
    .json(
      new ApiResponse(200, 'Logged in successfully.', {
        accessToken: token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          avatarUrl: user.avatarUrl,
          twoFactorEnabled: user.twoFactorEnabled,
        },
      })
    );
});

/**
 * POST /auth/verify-login-otp
 *
 * Completes a 2FA login by verifying the OTP sent during the login step.
 * Issues a JWT on success — same as the standard login path.
 */
export const verifyLoginOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    throw new ApiError(400, 'Email and OTP are required.');
  }

  const isValid = await OtpService.verifyOtp('login', email, otp);
  if (!isValid) {
    throw new ApiError(400, 'Invalid or expired OTP.');
  }

  const user = await AuthService.findUserByEmail(email);
  if (!user) {
    throw new ApiError(404, 'User not found.');
  }

  await OtpService.deleteOtp('login', email);

  const token = signToken(user._id);

  return res
    .status(200)
    .cookie('accessToken', token, ACCESS_TOKEN_COOKIE_OPTIONS)
    .json(
      new ApiResponse(200, 'Two-factor verification successful. Logged in.', {
        accessToken: token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          avatarUrl: user.avatarUrl,
          twoFactorEnabled: user.twoFactorEnabled,
        },
      })
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// Forgot Password / Reset Password
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /auth/forgot-password
 *
 * Initiates the password-reset flow by dispatching an OTP to the user's email.
 * Always returns the same success message regardless of whether the email exists —
 * this prevents account enumeration attacks.
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new ApiError(400, 'Email is required.');
  }

  const user = await AuthService.findUserByEmail(email);

  // Send OTP only if the account exists and is verified, but respond the same either way
  if (user && user.isVerified) {
    const otp = OtpService.generateOtp();
    await OtpService.storeOtp('reset', email, otp);
    await sendOtpEmail(email, user.username, otp, 'reset');
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      'If an account with that email exists, a password reset OTP has been sent.'
    )
  );
});

/**
 * POST /auth/reset-password
 *
 * Validates the reset OTP and saves the new hashed password.
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    throw new ApiError(400, 'Email, OTP, and new password are required.');
  }

  if (newPassword.length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters long.');
  }

  const isValid = await OtpService.verifyOtp('reset', email, otp);
  if (!isValid) {
    throw new ApiError(400, 'Invalid or expired OTP.');
  }

  const user = await AuthService.findUserByEmail(email);
  if (!user) {
    throw new ApiError(404, 'User not found.');
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);
  await AuthService.updateUserPassword(user._id, hashedPassword);
  await OtpService.deleteOtp('reset', email);

  return res.status(200).json(
    new ApiResponse(200, 'Password has been reset successfully. You can now log in.')
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Authenticated User Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /auth/change-password  [protected]
 *
 * Allows a logged-in user to update their password after confirming the current one.
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ApiError(400, 'Current password and new password are required.');
  }

  if (newPassword.length < 8) {
    throw new ApiError(400, 'New password must be at least 8 characters long.');
  }

  // Re-fetch the user including their hashed password for comparison
  const user = await AuthService.findUserById(req.user._id).select('+password');

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    throw new ApiError(401, 'Current password is incorrect.');
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);
  await AuthService.updateUserPassword(user._id, hashedPassword);

  return res.status(200).json(
    new ApiResponse(200, 'Password changed successfully.')
  );
});

/**
 * POST /auth/toggle-2fa  [protected]
 *
 * Enables or disables two-factor authentication for the authenticated user.
 * Accepts { enabled: true | false } in the request body.
 */
export const toggleTwoFactor = asyncHandler(async (req, res) => {
  const { enabled } = req.body;

  if (typeof enabled !== 'boolean') {
    throw new ApiError(400, 'The "enabled" field must be a boolean (true or false).');
  }

  const updatedUser = await AuthService.toggleTwoFactor(req.user._id, enabled);

  return res.status(200).json(
    new ApiResponse(
      200,
      `Two-factor authentication has been ${enabled ? 'enabled' : 'disabled'}.`,
      { twoFactorEnabled: updatedUser.twoFactorEnabled }
    )
  );
});

/**
 * GET /auth/me  [protected]
 *
 * Returns the authenticated user's public profile.
 * req.user is already populated by the authenticate middleware.
 */
export const getMe = asyncHandler(async (req, res) => {
  const { _id, username, email, avatarUrl, twoFactorEnabled, createdAt } = req.user;

  return res.status(200).json(
    new ApiResponse(200, 'User profile fetched successfully.', {
      id: _id,
      username,
      email,
      avatarUrl,
      twoFactorEnabled,
      createdAt,
    })
  );
});

/**
 * POST /auth/logout  [protected]
 *
 * Clears the access token cookie to log the user out on the client.
 * Since tokens are stateless (no server-side session), this is purely client-side.
 */
export const logout = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .clearCookie('accessToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    })
    .json(new ApiResponse(200, 'Logged out successfully.'));
});

/**
 * PATCH /auth/profile  [protected]
 *
 * Updates the authenticated user's profile (e.g. avatarUrl).
 */
export const updateProfile = asyncHandler(async (req, res) => {
  const { avatarUrl } = req.body;
  const updatedUser = await AuthService.updateProfile(req.user._id, { avatarUrl });

  return res.status(200).json(
    new ApiResponse(200, 'Profile updated successfully.', {
      avatarUrl: updatedUser.avatarUrl,
    })
  );
});

