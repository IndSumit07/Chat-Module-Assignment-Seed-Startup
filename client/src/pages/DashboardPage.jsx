import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, LogOut, Shield, Key, User, MessageSquare, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext.jsx';
import { changePassword, toggleTwoFactor } from '../api/auth.js';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout, login } = useAuth();

  const [loggingOut, setLoggingOut] = useState(false);
  const [toggling2FA, setToggling2FA] = useState(false);

  // Change password form state
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
    navigate('/login');
  };

  const handleToggle2FA = async () => {
    setToggling2FA(true);
    try {
      const newState = !user.twoFactorEnabled;
      const { data } = await toggleTwoFactor({ enabled: newState });
      // Update user in context by refreshing with the returned state
      login({ ...user, twoFactorEnabled: data.data.twoFactorEnabled });
      toast.success(`Two-factor authentication ${newState ? 'enabled' : 'disabled'}.`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update 2FA setting.');
    } finally {
      setToggling2FA(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!pwForm.currentPassword || !pwForm.newPassword) {
      toast.error('Both password fields are required.');
      return;
    }
    if (pwForm.newPassword.length < 8) {
      toast.error('New password must be at least 8 characters.');
      return;
    }

    setPwLoading(true);
    try {
      await changePassword(pwForm);
      toast.success('Password changed successfully.');
      setPwForm({ currentPassword: '', newPassword: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change password.');
    } finally {
      setPwLoading(false);
    }
  };

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : '??';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Top Navigation Bar ─────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-black rounded-md flex items-center justify-center">
              <MessageSquare className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-black">Chat Service</span>
          </div>

          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-black transition-colors disabled:opacity-40"
          >
            {loggingOut
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <LogOut className="w-3.5 h-3.5" />}
            Sign out
          </button>
        </div>
      </header>

      {/* ── Page Content ───────────────────────────────────────────────── */}
      <main className="max-w-4xl mx-auto px-6 py-10 space-y-6">

        {/* ── Profile Card ──────────────────────────────────────────── */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="w-14 h-14 bg-black rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-white text-lg font-semibold">{initials}</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-black truncate">{user?.username}</h1>
              <p className="text-sm text-gray-500 truncate">{user?.email}</p>
            </div>
            <div className="ml-auto flex-shrink-0">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-100 px-2.5 py-1 rounded-full">
                <CheckCircle className="w-3 h-3" />
                Verified
              </span>
            </div>
          </div>

          <div className="mt-5 pt-5 border-t border-gray-50 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider">Member since</p>
              <p className="text-sm font-medium text-black mt-1">
                {user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString('en-US', {
                      month: 'long', day: 'numeric', year: 'numeric',
                    })
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider">User ID</p>
              <p className="text-sm font-medium text-black mt-1 font-mono text-xs">{user?.id?.slice(-8) || '—'}</p>
            </div>
          </div>
        </div>

        {/* ── Security Card ──────────────────────────────────────────── */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <Shield className="w-4 h-4 text-black" />
            <h2 className="text-sm font-semibold text-black">Security</h2>
          </div>

          {/* 2FA Toggle */}
          <div className="flex items-center justify-between py-3 border-b border-gray-50">
            <div>
              <p className="text-sm font-medium text-black">Two-factor authentication</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Require an OTP on every sign-in
              </p>
            </div>
            <button
              onClick={handleToggle2FA}
              disabled={toggling2FA}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-40 ${
                user?.twoFactorEnabled ? 'bg-black' : 'bg-gray-200'
              }`}
              role="switch"
              aria-checked={user?.twoFactorEnabled}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                  user?.twoFactorEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Status indicator */}
          <div className="mt-3 flex items-center gap-1.5">
            {user?.twoFactorEnabled
              ? <CheckCircle className="w-3.5 h-3.5 text-green-600" />
              : <XCircle className="w-3.5 h-3.5 text-gray-300" />}
            <span className="text-xs text-gray-500">
              2FA is currently{' '}
              <span className={`font-medium ${user?.twoFactorEnabled ? 'text-green-600' : 'text-gray-400'}`}>
                {user?.twoFactorEnabled ? 'enabled' : 'disabled'}
              </span>
            </span>
          </div>
        </div>

        {/* ── Change Password Card ───────────────────────────────────── */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <Key className="w-4 h-4 text-black" />
            <h2 className="text-sm font-semibold text-black">Change password</h2>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label htmlFor="currentPassword" className="field-label">Current password</label>
              <div className="relative">
                <input
                  id="currentPassword"
                  type={showCurrent ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Your current password"
                  value={pwForm.currentPassword}
                  onChange={(e) => setPwForm((p) => ({ ...p, currentPassword: e.target.value }))}
                  disabled={pwLoading}
                  className="input-field pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black transition-colors"
                  tabIndex={-1}
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="newPassword" className="field-label">New password</label>
              <div className="relative">
                <input
                  id="newPassword"
                  type={showNew ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Min. 8 characters"
                  value={pwForm.newPassword}
                  onChange={(e) => setPwForm((p) => ({ ...p, newPassword: e.target.value }))}
                  disabled={pwLoading}
                  className="input-field pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black transition-colors"
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-1">
              <button
                type="submit"
                disabled={pwLoading}
                className="btn-primary !w-auto px-6"
              >
                {pwLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {pwLoading ? 'Saving…' : 'Update password'}
              </button>
            </div>
          </form>
        </div>

        {/* ── Quick Links Card ───────────────────────────────────────── */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-4 h-4 text-black" />
            <h2 className="text-sm font-semibold text-black">Account</h2>
          </div>
          <p className="text-sm text-gray-500">
            Your account is active and verified. The full Chat Service application will be available here once the messaging module is complete.
          </p>
        </div>
      </main>
    </div>
  );
}
