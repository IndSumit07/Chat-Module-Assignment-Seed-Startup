import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import toast from 'react-hot-toast';
import { loginUser, verifyLoginOtp } from '../api/auth.js';
import { useAuth } from '../contexts/AuthContext.jsx';

const OTP_LENGTH = 6;

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, user } = useAuth();

  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // 2FA state
  const [requires2FA, setRequires2FA] = useState(false);
  const [otpDigits, setOtpDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [otpLoading, setOtpLoading] = useState(false);
  const inputRefs = useRef([]);

  // Redirect already-authenticated users
  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      toast.error('Email and password are required.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await loginUser(form);

      if (data.data?.requires2FA) {
        setRequires2FA(true);
        toast.success('OTP sent to your email for verification.');
        setTimeout(() => inputRefs.current[0]?.focus(), 100);
      } else {
        login(data.data.user);
        toast.success('Welcome back!');
        navigate('/dashboard');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── 2FA OTP handlers ────────────────────────────────────────────────────────
  const handleDigitChange = (index, value) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    if (digit && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
    if (next.every((d) => d !== '') && digit) submitLoginOtp(next.join(''));
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0)
      inputRefs.current[index - 1]?.focus();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = Array(OTP_LENGTH).fill('');
    pasted.split('').forEach((ch, i) => { next[i] = ch; });
    setOtpDigits(next);
    inputRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
    if (pasted.length === OTP_LENGTH) submitLoginOtp(pasted);
  };

  const submitLoginOtp = async (otp) => {
    setOtpLoading(true);
    try {
      const { data } = await verifyLoginOtp({ email: form.email, otp });
      login(data.data.user);
      toast.success('Verified! Welcome back.');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid OTP.');
      setOtpDigits(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="auth-card">
        {/* Header */}
        <div className="mb-8">
          <div className="w-9 h-9 bg-black rounded-lg flex items-center justify-center mb-5">
            <LogIn className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-black tracking-tight">
            {requires2FA ? 'Two-step verification' : 'Sign in'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {requires2FA
              ? `Enter the 6-digit code sent to ${form.email}`
              : 'Welcome back to Chat Service'}
          </p>
        </div>

        {/* ── Standard Login Form ─────────────────────────────────────── */}
        {!requires2FA ? (
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="email" className="field-label">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="john@example.com"
                value={form.email}
                onChange={handleChange}
                disabled={loading}
                className="input-field"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="field-label" style={{ marginBottom: 0 }}>
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-gray-400 hover:text-black transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Your password"
                  value={form.password}
                  onChange={handleChange}
                  disabled={loading}
                  className="input-field pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary mt-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : (
          /* ── 2FA OTP Input ───────────────────────────────────────────── */
          <div>
            <div className="flex justify-between gap-2 mb-6" onPaste={handlePaste}>
              {otpDigits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  id={`login-otp-${i}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  disabled={otpLoading}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className="otp-digit disabled:opacity-50"
                />
              ))}
            </div>

            <button
              onClick={() => submitLoginOtp(otpDigits.join(''))}
              disabled={otpLoading || otpDigits.some((d) => !d)}
              className="btn-primary"
            >
              {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {otpLoading ? 'Verifying…' : 'Verify & sign in'}
            </button>

            <button
              onClick={() => { setRequires2FA(false); setOtpDigits(Array(OTP_LENGTH).fill('')); }}
              className="btn-ghost mt-3"
            >
              Use a different account
            </button>
          </div>
        )}

        {/* Footer */}
        {!requires2FA && (
          <p className="mt-6 text-center text-sm text-gray-500">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="font-medium text-black underline underline-offset-2 hover:text-gray-700">
              Create one
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
