import { useEffect, useState, useRef, useCallback } from 'react';
import { Send, X, Pencil, UserPlus, Users, Paperclip, Loader2, Trash2, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import MessageBubble from './MessageBubble.jsx';
import TypingIndicator from './TypingIndicator.jsx';
import MemberList from './MemberList.jsx';
import InviteModal from './InviteModal.jsx';
import { getMessages, updateConversation, deleteConversation } from '../api/conversation.js';
import { editMessage, deleteMessage } from '../api/message.js';
import { uploadFiles } from '../api/upload.js';
import usePresence from '../hooks/usePresence.js';
import { useAuth } from '../contexts/AuthContext.jsx';

const TYPING_DEBOUNCE_MS = 500;

/**
 * ChatWindow — displays the active conversation, handles all message events,
 * typing indicators, file uploads, and conversation management.
 *
 * @param {object}   conversation  — Active conversation object from the server
 * @param {object}   socket        — Authenticated Socket.io instance
 * @param {function} onBack        — Called when the mobile back button is pressed
 */
export default function ChatWindow({ conversation, socket, onBack }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [editingMessage, setEditingMessage] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [typingUsers, setTypingUsers] = useState([]);
  const [showMembers, setShowMembers] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingConv, setIsDeletingConv] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState(null);

  // Upload state
  const [attachments, setAttachments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const fileInputRef = useRef(null);
  const iconInputRef = useRef(null);

  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const convId = conversation?._id;

  // Derived values — computed once and reused throughout
  const currentUserId = user?.id || user?._id;
  const memberIds = conversation?.members?.map((m) => m.userId._id) || [];
  const { getStatus } = usePresence(socket, memberIds);
  const memberMap = Object.fromEntries(
    (conversation?.members || []).map((m) => [m.userId._id, m.userId])
  );
  const isOwner = conversation?.members?.find((m) => m.userId._id === currentUserId)?.role === 'owner';

  // ── Conversation lifecycle ────────────────────────────────────────────────
  useEffect(() => {
    if (!convId) return;

    setMessages([]);
    setCursor(null);
    setHasMore(true);
    setAttachments([]);
    setReplyingTo(null);
    setEditingMessage(null);
    setShowMembers(false);

    loadMessages(null);
    socket?.emit('conversation:join', { conversationId: convId });
    socket?.emit('message:read', { conversationId: convId });

    return () => {
      socket?.emit('conversation:leave', { conversationId: convId });
    };
  }, [convId]);

  const loadMessages = async (cursorDate) => {
    setLoadingMore(true);
    try {
      const { data } = await getMessages(convId, cursorDate ? { cursor: cursorDate } : {});
      const fetched = data.data.messages || [];
      setMessages((prev) => cursorDate ? [...prev, ...fetched] : fetched);
      setHasMore(data.data.hasMore);
      if (fetched.length > 0) {
        setCursor(fetched[fetched.length - 1].createdAt);
      }
    } catch {
      toast.error('Failed to load messages.');
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!loadingMore) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, loadingMore]);

  // ── Real-time socket event handlers ─────────────────────────────────────
  useEffect(() => {
    if (!socket || !convId) return;

    const handleNewMessage = ({ message, tempId }) => {
      setMessages((prev) => {
        if (tempId) {
          const idx = prev.findIndex((m) => m._id === tempId);
          if (idx !== -1) {
            const updated = [...prev];
            updated[idx] = message;
            return updated;
          }
        }
        if (prev.some((m) => m._id === message._id)) return prev;
        return [message, ...prev];
      });
      socket.emit('message:read', { conversationId: convId });
    };

    const handleEdited = ({ messageId, text }) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, text, isEdited: true } : m))
      );
    };

    const handleDeleted = ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, isDeleted: true } : m))
      );
    };

    const handleRead = ({ userId, lastReadAt }) => {
      setMessages((prev) =>
        prev.map((m) => ({
          ...m,
          readBy: m.sender?._id !== userId && !m.readBy?.some((r) => r.userId === userId)
            ? [...(m.readBy || []), { userId, readAt: lastReadAt }]
            : m.readBy,
          status: 'read',
        }))
      );
    };

    const handleTypingUpdate = ({ typingUsers: typers }) => {
      setTypingUsers(typers.filter((t) => t.userId !== currentUserId));
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:edited', handleEdited);
    socket.on('message:deleted', handleDeleted);
    socket.on('message:read', handleRead);
    socket.on('typing:update', handleTypingUpdate);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:edited', handleEdited);
      socket.off('message:deleted', handleDeleted);
      socket.off('message:read', handleRead);
      socket.off('typing:update', handleTypingUpdate);
    };
  }, [socket, convId, currentUserId]);

  // ── Input & typing handlers ───────────────────────────────────────────────
  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (!socket || !convId) return;

    socket.emit('typing:start', { conversationId: convId });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing:stop', { conversationId: convId });
    }, TYPING_DEBOUNCE_MS);
  };

  // ── File upload handlers ─────────────────────────────────────────────────
  const handleFileSelect = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const { data } = await uploadFiles(files);
      setAttachments((prev) => [...prev, ...data.data]);
    } catch {
      toast.error('Failed to upload files.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleIconSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !convId) return;

    setIsUploadingIcon(true);
    try {
      const { data } = await uploadFiles([file]);
      const iconUrl = data.data[0].url;
      await updateConversation(convId, { icon: iconUrl });
      toast.success('Group icon updated!');
    } catch {
      toast.error('Failed to update group icon.');
    } finally {
      setIsUploadingIcon(false);
      if (iconInputRef.current) iconInputRef.current.value = '';
    }
  };

  // ── Message send / edit ──────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || !socket || !convId) return;

    setInput('');
    const currentAttachments = [...attachments];
    setAttachments([]);

    socket.emit('typing:stop', { conversationId: convId });

    if (editingMessage) {
      if (editingMessage._id.startsWith('temp-')) {
        toast.error('Cannot edit a message that is still sending.');
        setEditingMessage(null);
        return;
      }
      try {
        await editMessage(editingMessage._id, { text });
      } catch {
        toast.error('Failed to edit message.');
        setInput(text);
      }
      setEditingMessage(null);
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const optimistic = {
      _id: tempId,
      text,
      attachments: currentAttachments,
      sender: { _id: currentUserId, username: user.username, avatarUrl: user.avatarUrl },
      conversationId: convId,
      status: 'sending',
      replyTo: replyingTo,
      createdAt: new Date().toISOString(),
      isEdited: false,
      isDeleted: false,
    };

    setMessages((prev) => [optimistic, ...prev]);
    setReplyingTo(null);

    socket.emit('message:send', {
      conversationId: convId,
      text,
      attachments: currentAttachments,
      replyTo: replyingTo?._id,
      tempId,
    });
  }, [input, socket, convId, editingMessage, replyingTo, currentUserId, user, attachments]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Message & conversation deletion ─────────────────────────────────────
  const handleDelete = async (messageId) => {
    if (messageId.startsWith('temp-')) {
      toast.error('Cannot delete a message that is still sending.');
      return;
    }
    try {
      await deleteMessage(messageId);
    } catch {
      toast.error('Failed to delete message.');
    }
  };

  const handleDeleteConversation = async () => {
    setIsDeletingConv(true);
    try {
      await deleteConversation(convId);
      toast.success('Conversation deleted permanently.');
      setShowDeleteConfirm(false);
      // The socket event conversation:deleted will handle routing away
    } catch {
      toast.error('Failed to delete conversation.');
    } finally {
      setIsDeletingConv(false);
    }
  };

  // ── Infinite scroll ──────────────────────────────────────────────────────
  const handleScroll = () => {
    if (!scrollContainerRef.current || loadingMore || !hasMore) return;
    if (scrollContainerRef.current.scrollTop < 80) {
      loadMessages(cursor);
    }
  };

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-300">
        <div className="text-center">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a conversation to start chatting</p>
        </div>
      </div>
    );
  }

  const sortedMessages = [...messages].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );

  return (
    <div className="flex flex-col flex-1 h-full min-w-0 bg-white">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 md:px-4 py-3 border-b border-gray-100 bg-white flex-shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          {/* Mobile back button */}
          <button
            onClick={onBack}
            className="md:hidden p-1.5 -ml-1 text-gray-400 hover:text-black transition-colors rounded-lg flex-shrink-0"
            title="Back to conversations"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="relative group/icon flex-shrink-0">
            <input type="file" ref={iconInputRef} onChange={handleIconSelect} className="hidden" accept="image/*" />
            <div className="w-9 h-9 md:w-10 md:h-10 bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden shadow-sm">
              {conversation.icon && conversation.icon !== 'users' ? (
                <img src={conversation.icon} alt="Group Icon" className="w-full h-full object-cover" />
              ) : (
                <Users className="w-4 h-4 md:w-5 md:h-5 text-gray-500" />
              )}
            </div>
            <button
              onClick={() => iconInputRef.current?.click()}
              disabled={isUploadingIcon}
              className="absolute inset-0 bg-black/50 opacity-0 group-hover/icon:opacity-100 transition-opacity flex items-center justify-center rounded-xl disabled:opacity-50"
            >
              {isUploadingIcon ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <span className="text-[10px] text-white font-medium">Edit</span>}
            </button>
          </div>

          <div className="min-w-0">
            <p className="text-[14px] md:text-[15px] font-bold text-black leading-tight truncate">{conversation.name || 'Conversation'}</p>
            <p className="text-xs font-medium text-gray-400 mt-0.5">{conversation.members?.length} members</p>
          </div>
        </div>

        <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
          {isOwner && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-red-400 hover:text-white hover:bg-red-500 transition-colors"
              title="Delete Conversation"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setShowInvite(true)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 transition-colors"
            title="Invite"
          >
            <UserPlus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowMembers((v) => !v)}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${showMembers ? 'bg-black text-white' : 'text-gray-400 hover:text-black hover:bg-gray-100'}`}
            title="Members"
          >
            <Users className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 relative">
        <div className="flex flex-col flex-1 min-w-0 bg-gray-50/50">
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-3 md:px-4 py-4 flex flex-col-reverse gap-0.5"
          >
            <div ref={messagesEndRef} />

            {sortedMessages.slice().reverse().map((msg, index, arr) => {
              const prevMsg = arr[index + 1];
              const showSenderInfo = !prevMsg || prevMsg.sender?._id !== msg.sender?._id;
              const isOwnMessage = msg.sender?._id === currentUserId || msg.sender === currentUserId;

              return (
                <MessageBubble
                  key={msg._id}
                  message={msg}
                  isOwn={isOwnMessage}
                  showSenderInfo={showSenderInfo}
                  onEdit={(m) => { setEditingMessage(m); setInput(m.text); }}
                  onDelete={handleDelete}
                  onReply={(m) => setReplyingTo(m)}
                />
              );
            })}

            {loadingMore && (
              <div className="text-center text-xs text-gray-300 py-3 font-medium">Loading…</div>
            )}
          </div>

          <TypingIndicator typingUsers={typingUsers} memberMap={memberMap} />

          {/* Attachment Preview */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 md:px-4 py-3 bg-white border-t border-gray-100">
              {attachments.map((att, idx) => (
                <div key={idx} className="relative group w-16 h-16 rounded-xl overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center">
                  {att.type === 'image' ? (
                    <img src={att.url} alt={att.filename} className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-[10px] text-gray-500 font-medium truncate w-14 text-center px-1">
                      {att.filename.split('.').pop().toUpperCase()}
                    </div>
                  )}
                  <button
                    onClick={() => handleRemoveAttachment(idx)}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Reply Banner */}
          {replyingTo && (
            <div className="flex items-center justify-between px-3 md:px-4 py-2 bg-gray-50 border-t border-gray-200 shadow-inner">
              <div className="text-xs text-gray-600 truncate border-l-2 border-black pl-2">
                <span className="font-bold text-black">Replying to {replyingTo.sender?.username}:</span>{' '}
                {replyingTo.text || 'Attachment'}
              </div>
              <button onClick={() => setReplyingTo(null)} className="p-1 hover:bg-gray-200 rounded-full transition-colors flex-shrink-0">
                <X className="w-3.5 h-3.5 text-gray-500 hover:text-black" />
              </button>
            </div>
          )}

          {/* Edit Banner */}
          {editingMessage && (
            <div className="flex items-center justify-between px-3 md:px-4 py-2 bg-gray-50 border-t border-gray-200 shadow-inner">
              <div className="flex items-center gap-2 text-xs text-gray-600 font-medium">
                <Pencil className="w-3.5 h-3.5" />
                <span>Editing message</span>
              </div>
              <button onClick={() => { setEditingMessage(null); setInput(''); }} className="p-1 hover:bg-gray-200 rounded-full transition-colors flex-shrink-0">
                <X className="w-3.5 h-3.5 text-gray-500 hover:text-black" />
              </button>
            </div>
          )}

          {/* ── Message Input ────────────────────────────────────────────────── */}
          <div className="px-3 md:px-4 py-3 bg-white border-t border-gray-200 flex items-end gap-2">
            <input
              type="file"
              multiple
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 transition-colors disabled:opacity-50 flex-shrink-0"
              title="Attach files"
            >
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-5 h-5" />}
            </button>

            <textarea
              rows={1}
              placeholder="Type a message…"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              className="flex-1 resize-none px-4 py-2.5 text-sm bg-gray-100 border border-transparent rounded-2xl focus:outline-none focus:bg-white focus:border-gray-300 focus:ring-4 focus:ring-gray-50 transition-all placeholder:text-gray-400 max-h-32"
            />

            <button
              onClick={handleSend}
              disabled={(!input.trim() && attachments.length === 0) || isUploading}
              className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center hover:bg-gray-800 hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:hover:scale-100 disabled:cursor-not-allowed flex-shrink-0 shadow-sm"
            >
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          </div>
        </div>

        {/* Member list panel — overlay on mobile, push layout on desktop */}
        {showMembers && (
          <div className="absolute inset-y-0 right-0 md:relative md:inset-auto w-64 border-l border-gray-100 bg-white flex-shrink-0 shadow-xl z-20">
            <MemberList members={conversation.members || []} getStatus={getStatus} />
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <InviteModal
          conversationId={convId}
          conversationName={conversation.name}
          onClose={() => setShowInvite(false)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="p-6">
              <h2 className="text-lg font-bold text-black mb-2">Delete Conversation?</h2>
              <p className="text-sm text-gray-500 mb-6">
                Are you sure you want to delete this conversation? This will permanently erase all messages, files, and images for everyone. This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeletingConv}
                  className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-black text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConversation}
                  disabled={isDeletingConv}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeletingConv && <Loader2 className="w-4 h-4 animate-spin" />}
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
