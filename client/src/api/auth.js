import api from './axios.js';

/** Register a new user — sends OTP to their email */
export const registerUser = (data) =>
  api.post('/auth/register', data);

/** Verify registration OTP to activate the account */
export const verifyRegisterOtp = (data) =>
  api.post('/auth/verify-otp', data);

/** Login with email + password. May return { requires2FA: true } */
export const loginUser = (data) =>
  api.post('/auth/login', data);

/** Complete 2FA login by submitting the OTP sent to email */
export const verifyLoginOtp = (data) =>
  api.post('/auth/verify-login-otp', data);

/** Request a password-reset OTP to be sent to the given email */
export const forgotPassword = (data) =>
  api.post('/auth/forgot-password', data);

/** Reset password using the OTP received via email */
export const resetPassword = (data) =>
  api.post('/auth/reset-password', data);

/** Fetch the authenticated user's profile */
export const getMe = () =>
  api.get('/auth/me');

/** Change password while logged in */
export const changePassword = (data) =>
  api.post('/auth/change-password', data);

/** Enable or disable two-factor authentication */
export const toggleTwoFactor = (data) =>
  api.post('/auth/toggle-2fa', data);

/** Clear the access token cookie and log out */
export const logoutUser = () =>
  api.post('/auth/logout');
