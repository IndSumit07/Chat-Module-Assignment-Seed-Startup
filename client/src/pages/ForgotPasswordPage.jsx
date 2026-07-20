import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { forgotPassword } from '../api/auth.js';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) { toast.error('Email is required.'); return; }

    setLoading(true);
    try {
      await forgotPassword({ email });
      toast.success('If that email exists, a reset OTP has been sent.');
      navigate('/reset-password', { state: { email } });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="auth-card">
        <div className="mb-8">
          <div className="w-9 h-9 bg-black rounded-lg flex items-center justify-center mb-5">
            <KeyRound className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-black tracking-tight">Forgot password?</h1>
          <p className="text-sm text-gray-500 mt-1">Enter your email and we'll send you a reset code</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="field-label">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="john@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className="input-field"
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? 'Sending…' : 'Send reset code'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Remember your password?{' '}
          <Link to="/login" className="font-medium text-black underline underline-offset-2 hover:text-gray-700">
            Sign in
          </Link>
        </p>

        <p className="mt-3 text-center text-sm text-gray-400">
          Already have a code?{' '}
          <Link to="/reset-password" className="font-medium text-black underline underline-offset-2 hover:text-gray-700">
            Reset password
          </Link>
        </p>
      </div>
    </div>
  );
}
