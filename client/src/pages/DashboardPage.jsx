import { useState, useEffect, useCallback } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import ChatWindow from '../components/ChatWindow.jsx';
import useSocket, { disconnectSocket } from '../hooks/useSocket.js';
import { getMyConversations } from '../api/conversation.js';
import { getMyNotifications } from '../api/notification.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import toast from 'react-hot-toast';

/**
 * DashboardPage (Workspace Layout)
 *
 * This is the main application interface, consisting of the Sidebar (conversations)
 * and the ChatWindow (active conversation). It initializes the Socket.io connection.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const socket = useSocket(true); // Singleton socket initialized here

  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // ── Initial Data Load ────────────────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    try {
      const { data } = await getMyConversations();
      setConversations(data.data || []);

      // If active conversation is no longer in list (e.g. left), deselect it
      if (activeConv && !(data.data || []).some(c => c._id === activeConv._id)) {
        setActiveConv(null);
      } else if (activeConv) {
        // Refresh active conversation metadata
        const updated = (data.data || []).find(c => c._id === activeConv._id);
        if (updated) setActiveConv(updated);
      }
    } catch {
      toast.error('Failed to load conversations.');
    } finally {
      setLoading(false);
    }
  }, [activeConv]);

  const fetchNotificationCount = useCallback(async () => {
    try {
      const { data } = await getMyNotifications({ limit: 1 });
      setNotificationCount(data.data.unreadCount || 0);
    } catch {
      // suppress
    }
  }, []);

  useEffect(() => {
    fetchConversations();
    fetchNotificationCount();
  }, [fetchConversations, fetchNotificationCount]);

  // ── Global Socket Listeners ──────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // Refresh conversation list on any updates
    const handleConversationUpdated = () => fetchConversations();

    // Increment notification count on new notification
    const handleNotification = ({ unreadCount, notification }) => {
      setNotificationCount(unreadCount);
      toast.success(notification.title, {
        icon: '🔔',
        style: { fontSize: '12px' },
      });
    };

    // Increment notification count on new invitation
    const handleInvitation = ({ invitation }) => {
      // Let notification handle the count bump; just show the toast
      toast(`You've been invited to ${invitation.conversationId.name}`, {
        icon: '📩',
        style: { fontSize: '12px' },
      });
    };

    socket.on('conversation:updated', handleConversationUpdated);
    socket.on('conversation:deleted', handleConversationUpdated);
    socket.on('notification:new', handleNotification);
    socket.on('invitation:new', handleInvitation);

    return () => {
      socket.off('conversation:updated', handleConversationUpdated);
      socket.off('conversation:deleted', handleConversationUpdated);
      socket.off('notification:new', handleNotification);
      socket.off('invitation:new', handleInvitation);
    };
  }, [socket, fetchConversations]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSelectConversation = (conv) => {
    setActiveConv(conv);
    // Optimistically clear unread count for this conv in the sidebar
    setConversations((prev) =>
      prev.map((c) => (c._id === conv._id ? { ...c, unreadCount: 0 } : c))
    );
  };

  const handleCreateSuccess = (newConv) => {
    fetchConversations();
    handleSelectConversation(newConv);
  };

  return (
    <div className="h-screen w-full bg-white flex overflow-hidden">
      <Sidebar
        conversations={conversations}
        activeId={activeConv?._id}
        onSelect={handleSelectConversation}
        unreadCount={notificationCount}
        onUnreadCountChange={setNotificationCount}
        onCreateSuccess={handleCreateSuccess}
        loading={loading}
        onRefresh={fetchConversations}
      />
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        <ChatWindow conversation={activeConv} socket={socket} />
      </div>
    </div>
  );
}
