import { useState } from 'react';
import { Search, Plus, Hash, Settings, Bell, MessageSquare, Loader2, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { createConversation } from '../api/conversation.js';
import NotificationPanel from './NotificationPanel.jsx';

export default function Sidebar({
  conversations = [],
  activeId,
  onSelect,
  unreadCount = 0,
  onUnreadCountChange,
  onCreateSuccess,
  loading = false,
  onRefresh,
}) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showNotif, setShowNotif] = useState(false);

  const [createName, setCreateName] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const filtered = conversations.filter((c) =>
    (c.name || 'Conversation').toLowerCase().includes(filter.toLowerCase())
  );

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createName.trim()) return;

    setCreateLoading(true);
    try {
      const { data } = await createConversation({ name: createName.trim(), isGroup: true });
      toast.success('Conversation created');
      setCreateName('');
      setShowCreate(false);
      onCreateSuccess(data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create conversation');
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="w-full h-full bg-gray-50 flex flex-col border-r border-gray-200 relative">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-4 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-black rounded-lg flex items-center justify-center">
            <MessageSquare className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-black tracking-tight">Chat Service</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            className="p-1.5 text-gray-400 hover:text-black transition-colors rounded-lg hover:bg-gray-200/50"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowNotif(true)}
            className="p-1.5 text-gray-400 hover:text-black transition-colors rounded-lg hover:bg-gray-200/50 relative"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full ring-2 ring-gray-50" />
            )}
          </button>
          <button
            onClick={() => navigate('/profile')}
            className="p-1.5 text-gray-400 hover:text-black transition-colors rounded-lg hover:bg-gray-200/50"
            title="Profile & Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Search & Actions ────────────────────────────────────────────────── */}
      <div className="px-4 pb-4 border-b border-gray-200 space-y-3 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search conversations…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-black transition-colors"
          />
        </div>
        {!showCreate ? (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-black hover:bg-gray-100 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New conversation
          </button>
        ) : (
          <form onSubmit={handleCreate} className="flex gap-2">
            <input
              type="text"
              autoFocus
              placeholder="Group name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-black transition-colors min-w-0"
            />
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-2 py-1.5 text-sm font-medium text-gray-500 hover:text-black"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createLoading || !createName.trim()}
              className="px-3 py-1.5 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {createLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
            </button>
          </form>
        )}
      </div>

      {/* ── Conversation List ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {loading && conversations.length === 0 ? (
          <div className="flex items-center justify-center h-20">
            <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-xs text-gray-400 mt-6">
            No conversations found.
          </div>
        ) : (
          filtered.map((conv) => (
            <button
              key={conv._id}
              onClick={() => onSelect(conv)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-colors ${
                activeId === conv._id ? 'bg-black text-white' : 'hover:bg-gray-200/50 text-black'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    activeId === conv._id ? 'bg-white/20' : 'bg-gray-200'
                  }`}
                >
                  <Hash className={`w-4 h-4 ${activeId === conv._id ? 'text-white' : 'text-gray-500'}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{conv.name || 'Conversation'}</p>
                  <p
                    className={`text-[11px] truncate mt-0.5 ${
                      activeId === conv._id ? 'text-gray-300' : 'text-gray-500'
                    }`}
                  >
                    {conv.lastMessage?.text ||
                     (conv.lastMessage?.attachments?.length > 0
                       ? `[${conv.lastMessage.attachments.length} Attachment${conv.lastMessage.attachments.length > 1 ? 's' : ''}]`
                       : 'No messages yet')}
                  </p>
                </div>
              </div>
              {conv.unreadCount > 0 && activeId !== conv._id && (
                <span className="flex-shrink-0 ml-2 px-1.5 py-0.5 bg-black text-white text-[10px] font-bold rounded-full min-w-[18px] text-center">
                  {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                </span>
              )}
            </button>
          ))
        )}
      </div>

      <NotificationPanel
        isOpen={showNotif}
        onClose={() => setShowNotif(false)}
        unreadCount={unreadCount}
        onUnreadCountChange={onUnreadCountChange}
        onInvitationRespond={onRefresh}
      />
    </div>
  );
}
