import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Loader2, MailCheck, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { verifyRegisterOtp, registerUser } from '../api/auth.js';

const OTP_LENGTH = 6;

export default function VerifyOtpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email || '';

  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef([]);

  // Redirect if arrived without email in state
  useEffect(() => {
    if (!email) navigate('/register', { replace: true });
  }, [email, navigate]);

  // Auto-focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleDigitChange = (index, value) => {
    // Accept only a single digit
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);

    // Advance focus on digit entry
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits are filled
    if (next.every((d) => d !== '') && digit) {
      submitOtp(next.join(''));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = Array(OTP_LENGTH).fill('');
    pasted.split('').forEach((ch, i) => { next[i] = ch; });
    setDigits(next);
    const focusIndex = Math.min(pasted.length, OTP_LENGTH - 1);
    inputRefs.current[focusIndex]?.focus();
    if (pasted.length === OTP_LENGTH) submitOtp(pasted);
  };

  const submitOtp = async (otp) => {
    setLoading(true);
    try {
      await verifyRegisterOtp({ email, otp });
      toast.success('Email verified! You can now sign in.');
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid OTP. Please try again.');
      setDigits(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      // Re-register with the same email triggers a new OTP
      await registerUser({ email, username: location.state?.username || '', password: location.state?.password || '' });
      toast.success('New OTP sent to your email.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not resend OTP.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="auth-card">
        {/* Header */}
        <div className="mb-8">
          <div className="w-9 h-9 bg-black rounded-lg flex items-center justify-center mb-5">
            <MailCheck className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-black tracking-tight">Check your email</h1>
          <p className="text-sm text-gray-500 mt-1">
            We sent a 6-digit code to{' '}
            <span className="font-medium text-black">{email}</span>
          </p>
        </div>

        {/* OTP Digit Inputs */}
        <div className="flex justify-between gap-2 mb-6" onPaste={handlePaste}>
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              id={`otp-digit-${i}`}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              disabled={loading}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="otp-digit disabled:opacity-50"
            />
          ))}
        </div>

        {/* Submit */}
        <button
          onClick={() => submitOtp(digits.join(''))}
          disabled={loading || digits.some((d) => !d)}
          className="btn-primary"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {loading ? 'Verifying…' : 'Verify email'}
        </button>

        {/* Resend */}
        <p className="mt-5 text-center text-sm text-gray-500">
          Didn&apos;t receive it?{' '}
          <button
            onClick={handleResend}
            disabled={resending || loading}
            className="font-medium text-black underline underline-offset-2 hover:text-gray-700 disabled:opacity-40"
          >
            {resending ? 'Sending…' : 'Resend code'}
          </button>
        </p>

        {/* Back */}
        <Link
          to="/register"
          className="flex items-center justify-center gap-1.5 mt-4 text-sm text-gray-400 hover:text-black transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to register
        </Link>
      </div>
    </div>
  );
}
