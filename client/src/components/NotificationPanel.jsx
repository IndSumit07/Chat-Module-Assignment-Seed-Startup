import { useState, useEffect } from 'react';
import { Bell, X, Check, CheckCheck, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { getMyNotifications, markRead, markAllRead } from '../api/notification.js';
import { respondToInvitation } from '../api/invitation.js';

/**
 * NotificationPanel — slide-in panel showing in-app notifications.
 *
 * Features:
 * - Paginated notification list
 * - Accept / Reject directly for invitation notifications
 * - Mark single / all read
 * - Live unread count badge update via socket
 *
 * @param {boolean}  isOpen
 * @param {Function} onClose
 * @param {number}   unreadCount
 * @param {Function} onUnreadCountChange  — called when count changes
 * @param {Function} onInvitationRespond  — called when accept triggers conversation update
 */
export default function NotificationPanel({
  isOpen,
  onClose,
  unreadCount = 0,
  onUnreadCountChange,
  onInvitationRespond,
}) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [respondingId, setRespondingId] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    fetchNotifications();
  }, [isOpen]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const { data } = await getMyNotifications();
      setNotifications(data.data.notifications || []);
      onUnreadCountChange?.(data.data.unreadCount || 0);
    } catch {
      toast.error('Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (id) => {
    try {
      const { data } = await markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
      );
      onUnreadCountChange?.(data.data.unreadCount);
    } catch { /* suppress */ }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      onUnreadCountChange?.(0);
    } catch {
      toast.error('Failed to mark all as read.');
    }
  };

  const handleInvitationAction = async (notification, action) => {
    const invitationId = notification.data?.invitationId;
    if (!invitationId) return;

    setRespondingId(invitationId);
    try {
      await respondToInvitation(invitationId, action);
      toast.success(action === 'accept' ? 'Invitation accepted!' : 'Invitation declined.');
      await handleMarkRead(notification._id);
      if (action === 'accept') onInvitationRespond?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to respond.');
    } finally {
      setRespondingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="absolute right-0 top-12 z-50 w-80 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-black" />
            <span className="text-sm font-semibold text-black">Notifications</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 bg-black text-white text-[10px] font-bold rounded-full min-w-[18px] text-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] text-gray-400 hover:text-black transition-colors"
              >
                Mark all read
              </button>
            )}
            <button onClick={onClose} className="text-gray-300 hover:text-black transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
          {loading ? (
            <div className="py-10 text-center text-sm text-gray-400">Loading…</div>
          ) : notifications.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">No notifications yet</div>
          ) : (
            notifications.map((n) => (
              <div
                key={n._id}
                className={`px-4 py-3 transition-colors ${n.isRead ? 'bg-white' : 'bg-gray-50'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-black leading-snug">{n.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-snug line-clamp-2">{n.body}</p>
                    <p className="text-[10px] text-gray-300 mt-1">
                      {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {!n.isRead && (
                    <button
                      onClick={() => handleMarkRead(n._id)}
                      className="flex-shrink-0 text-gray-300 hover:text-black transition-colors mt-0.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Invitation action buttons */}
                {n.type === 'invitation' && n.data?.invitationId && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleInvitationAction(n, 'accept')}
                      disabled={respondingId === n.data.invitationId}
                      className="flex-1 text-xs bg-black text-white py-1.5 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-40"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleInvitationAction(n, 'reject')}
                      disabled={respondingId === n.data.invitationId}
                      className="flex-1 text-xs bg-white text-gray-600 border border-gray-200 py-1.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40"
                    >
                      Decline
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
