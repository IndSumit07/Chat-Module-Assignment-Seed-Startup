import { useState, useEffect, useCallback, useRef } from 'react';
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
 *
 * On mobile (<md), the layout uses a single-panel pattern:
 *   - mobileView='sidebar' → shows only the Sidebar
 *   - mobileView='chat'    → shows only the ChatWindow
 * On desktop (>=md), both panels are always visible side-by-side.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const socket = useSocket(true); // Singleton socket initialized here

  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Controls which panel is visible on mobile
  const [mobileView, setMobileView] = useState('sidebar'); // 'sidebar' | 'chat'

  // ── Initial Data Load ────────────────────────────────────────────────────────

  // Use a ref so fetchConversations can read the current activeConv without
  // needing it as a dependency (which would cause an infinite refetch loop).
  const activeConvRef = useRef(activeConv);
  useEffect(() => {
    activeConvRef.current = activeConv;
  }, [activeConv]);

  const fetchConversations = useCallback(async () => {
    try {
      const { data } = await getMyConversations();
      const list = data.data || [];
      setConversations(list);

      const current = activeConvRef.current;
      if (current && !list.some(c => c._id === current._id)) {
        // Active conversation was removed (deleted or left) — deselect
        setActiveConv(null);
        setMobileView('sidebar');
      } else if (current) {
        // Refresh active conversation metadata without changing selection
        const updated = list.find(c => c._id === current._id);
        if (updated) setActiveConv(updated);
      }
    } catch {
      toast.error('Failed to load conversations.');
    } finally {
      setLoading(false);
    }
  }, []); // stable — reads activeConv via ref, not as a dep

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

    const handleConversationUpdated = () => fetchConversations();

    const handleNotification = ({ unreadCount, notification }) => {
      setNotificationCount(unreadCount);
      toast.success(notification.title, {
        icon: '🔔',
        style: { fontSize: '12px' },
      });
    };

    const handleInvitation = ({ invitation }) => {
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
    setMobileView('chat'); // Switch to chat panel on mobile
    // Optimistically clear unread count for this conv in the sidebar
    setConversations((prev) =>
      prev.map((c) => (c._id === conv._id ? { ...c, unreadCount: 0 } : c))
    );
  };

  const handleCreateSuccess = (newConv) => {
    fetchConversations();
    handleSelectConversation(newConv);
  };

  const handleMobileBack = () => {
    setMobileView('sidebar');
  };

  return (
    <div className="h-screen w-full bg-white flex overflow-hidden">
      {/* Sidebar: full-screen on mobile when mobileView==='sidebar', fixed width on desktop */}
      <div
        className={`
          ${mobileView === 'sidebar' ? 'flex' : 'hidden'}
          md:flex w-full md:w-72 flex-col flex-shrink-0
        `}
      >
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
      </div>

      {/* ChatWindow: full-screen on mobile when mobileView==='chat', flex-1 on desktop */}
      <div
        className={`
          ${mobileView === 'chat' ? 'flex' : 'hidden'}
          md:flex flex-1 flex-col min-w-0 bg-white
        `}
      >
        <ChatWindow
          conversation={activeConv}
          socket={socket}
          onBack={handleMobileBack}
        />
      </div>
    </div>
  );
}
