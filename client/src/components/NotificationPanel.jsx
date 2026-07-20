import { useState, useEffect } from 'react';
import { Bell, X, Check, Loader2, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { getMyNotifications, markRead, markAllRead } from '../api/notification.js';
import { respondToInvitation } from '../api/invitation.js';

/**
 * NotificationPanel — slide-in panel showing in-app notifications.
 *
 * Uses fixed positioning so it displays correctly on both mobile and desktop.
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
      {/* Backdrop — full-screen, catches clicks outside the panel */}
      <div
        className="fixed inset-0 z-40 bg-black/10"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel — fixed on screen so it works on mobile too */}
      <div
        role="dialog"
        aria-label="Notifications"
        className="fixed z-50 bg-white border border-gray-100 rounded-2xl shadow-2xl overflow-hidden
                   bottom-0 left-0 right-0 rounded-b-none max-h-[85vh]
                   md:bottom-auto md:left-auto md:right-4 md:top-16 md:w-80 md:max-h-[32rem] md:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-black" />
            <span className="text-sm font-semibold text-black">Notifications</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 bg-black text-white text-[10px] font-bold rounded-full min-w-[18px] text-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] text-gray-400 hover:text-black transition-colors"
              >
                Mark all read
              </button>
            )}
            <button onClick={onClose} className="text-gray-300 hover:text-black transition-colors p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto divide-y divide-gray-50 flex-1" style={{ maxHeight: 'inherit' }}>
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-gray-400">
              <Bell className="w-8 h-8 opacity-20" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n._id}
                className={`px-4 py-3 transition-colors ${n.isRead ? 'bg-white' : 'bg-gray-50'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    {n.type === 'invitation' && (
                      <div className="flex-shrink-0 w-7 h-7 bg-black rounded-lg flex items-center justify-center mt-0.5">
                        <UserPlus className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-black leading-snug">{n.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-snug line-clamp-2">{n.body}</p>
                      <p className="text-[10px] text-gray-300 mt-1">
                        {new Date(n.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  {!n.isRead && (
                    <button
                      onClick={() => handleMarkRead(n._id)}
                      className="flex-shrink-0 text-gray-300 hover:text-black transition-colors mt-0.5 p-1"
                      title="Mark as read"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Invitation action buttons */}
                {n.type === 'invitation' && n.data?.invitationId && !n.isRead && (
                  <div className="flex gap-2 mt-2 ml-9">
                    <button
                      onClick={() => handleInvitationAction(n, 'accept')}
                      disabled={respondingId === n.data.invitationId}
                      className="flex-1 text-xs bg-black text-white py-1.5 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-40 flex items-center justify-center gap-1"
                    >
                      {respondingId === n.data.invitationId ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
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
