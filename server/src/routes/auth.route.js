import { Router } from 'express';
import {
  register,
  resendOtp,
  verifyRegisterOtp,
  login,
  verifyLoginOtp,
  forgotPassword,
  resetPassword,
  changePassword,
  toggleTwoFactor,
  getMe,
  logout,
  updateProfile,
} from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

// ── Public routes — no authentication required ────────────────────────────────
router.post('/register',           register);
router.post('/resend-otp',         resendOtp);
router.post('/verify-otp',         verifyRegisterOtp);
router.post('/login',              login);
router.post('/verify-login-otp',   verifyLoginOtp);
router.post('/forgot-password',    forgotPassword);
router.post('/reset-password',     resetPassword);

// ── Protected routes — valid JWT required ─────────────────────────────────────
router.use(authenticate); // Apply middleware to all routes defined after this line

router.get('/me',               getMe);
router.post('/logout',          logout);
router.post('/change-password', changePassword);
router.post('/toggle-2fa',      toggleTwoFactor);
router.patch('/profile',        updateProfile);

export default router;
