import { X, UserPlus, Loader2 } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { inviteToConversation } from '../api/conversation.js';

/**
 * InviteModal — allows a conversation member to invite others by email.
 *
 * @param {string}   conversationId
 * @param {string}   conversationName
 * @param {Function} onClose
 */
export default function InviteModal({ conversationId, conversationName, onClose }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) { toast.error('Email is required.'); return; }

    setLoading(true);
    try {
      await inviteToConversation(conversationId, { email: email.trim(), message: message.trim() });
      toast.success(`Invitation sent to ${email.trim()}.`);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send invitation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-50">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-black rounded-lg flex items-center justify-center">
              <UserPlus className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-black">Invite someone</h2>
              <p className="text-xs text-gray-400">{conversationName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-black transition-colors"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label htmlFor="invite-email" className="field-label">Email address</label>
            <input
              id="invite-email"
              type="email"
              placeholder="colleague@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className="input-field"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="invite-message" className="field-label">
              Personal message{' '}
              <span className="text-gray-300 font-normal">(optional)</span>
            </label>
            <textarea
              id="invite-message"
              rows={3}
              placeholder="Hey! Join our conversation on Chat Service..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={loading}
              className="input-field resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="btn-ghost flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex-1"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? 'Sending…' : 'Send invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
