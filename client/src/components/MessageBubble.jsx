import { Check, CheckCheck, Trash2, Pencil, Reply, FileText } from 'lucide-react';
import { useState } from 'react';

/**
 * Formats a file size in bytes into a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
};

export default function MessageBubble({
  message,
  isOwn,
  showSenderInfo = true,
  onEdit,
  onDelete,
  onReply,
}) {
  const [hovering, setHovering] = useState(false);

  if (message.isDeleted) {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${showSenderInfo ? 'mt-3' : 'mt-0.5'}`}>
        <div className="text-xs text-gray-400 italic px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-xl">
          Message deleted
        </div>
      </div>
    );
  }

  const statusIcon = () => {
    if (!isOwn) return null;
    if (message.status === 'read') return <CheckCheck className="w-3.5 h-3.5 text-blue-400" />;
    if (message.status === 'delivered') return <CheckCheck className="w-3.5 h-3.5 text-gray-400" />;
    if (message.status === 'sending') return <Check className="w-3.5 h-3.5 text-gray-300 animate-pulse" />;
    return <Check className="w-3.5 h-3.5 text-gray-400" />;
  };

  return (
    <div
      className={`group flex ${isOwn ? 'justify-end' : 'justify-start'} ${showSenderInfo ? 'mt-4' : 'mt-1'}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Avatar (only for others and only if showSenderInfo is true) */}
      {!isOwn && (
        <div className="w-8 flex-shrink-0 mr-2 flex flex-col justify-end pb-1">
          {showSenderInfo && (
            <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center">
              {message.sender?.avatarUrl ? (
                <img src={message.sender.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs font-bold text-gray-500">
                  {message.sender?.username?.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div className={`relative max-w-[80%] md:max-w-[75%] flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
        
        {/* Username above the first bubble in a group */}
        {!isOwn && showSenderInfo && (
          <span className="text-xs font-semibold text-gray-500 mb-1 ml-1">
            {message.sender?.username}
          </span>
        )}

        {/* Reply preview */}
        {message.replyTo && !message.replyTo.isDeleted && (
          <div
            className={`text-xs text-gray-500 border-l-2 border-gray-300 pl-2 mb-1 max-w-full truncate ${
              isOwn ? 'text-right opacity-70' : ''
            }`}
          >
            <span className="font-medium text-gray-700">{message.replyTo.sender?.username}</span>:{' '}
            {message.replyTo.text || 'Attachment'}
          </div>
        )}

        {/* Bubble content */}
        <div
          className={`px-4 py-2.5 shadow-sm text-[15px] leading-relaxed relative ${
            isOwn
              ? `bg-black text-white ${showSenderInfo ? 'rounded-2xl rounded-tr-sm' : 'rounded-2xl'}`
              : `bg-white border border-gray-200 text-gray-900 ${showSenderInfo ? 'rounded-2xl rounded-tl-sm' : 'rounded-2xl'}`
          }`}
        >
          {/* Attachments */}
          {message.attachments?.length > 0 && (
            <div className={`flex flex-wrap gap-2 ${message.text ? 'mb-2' : ''}`}>
              {message.attachments.map((att, idx) => (
                <a
                  key={idx}
                  href={att.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block relative group/att overflow-hidden rounded-lg bg-white/10"
                >
                  {att.type === 'image' ? (
                    <img
                      src={att.url}
                      alt={att.filename}
                      className="max-h-52 max-w-[240px] rounded-lg object-contain cursor-pointer hover:opacity-90 transition-opacity"
                    />
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-black/10 rounded-lg hover:bg-black/20 transition-colors min-w-[160px]">
                      <FileText className="w-6 h-6 flex-shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium truncate max-w-[120px]">{att.filename}</span>
                        {att.size > 0 && (
                          <span className="text-[10px] opacity-70">{formatFileSize(att.size)}</span>
                        )}
                      </div>
                    </div>
                  )}
                </a>
              ))}
            </div>
          )}

          {/* Text */}
          {message.text && (
            <p className="whitespace-pre-wrap break-words">{message.text}</p>
          )}

          {/* Timestamp + status + edited badge */}
          <div
            className={`flex items-center gap-1.5 mt-1.5 text-[10px] font-medium tracking-wide float-right ml-4 ${
              isOwn ? 'text-gray-400' : 'text-gray-400'
            }`}
            style={{ shapeOutside: 'margin-box' }}
          >
            {message.isEdited && <span className="italic opacity-80">edited</span>}
            <span className="opacity-90">
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {statusIcon()}
          </div>
          
          {/* Clearfix for the floated timestamp */}
          <div className="clear-both" />
        </div>

        {/* ── Action buttons ──
            On desktop: appear as a floating popup adjacent to the bubble.
            On mobile: appear below the bubble as a visible row (no hover state needed). */}

        {/* Own message actions */}
        {isOwn && (
          <div
            className={`flex items-center gap-1 mt-1 ${
              hovering ? 'flex' : 'hidden md:flex md:opacity-0 md:group-hover:opacity-100'
            } md:absolute md:top-0 md:-left-20 md:mt-0 md:bg-white md:border md:border-gray-200 md:rounded-lg md:shadow-sm md:px-1.5 md:py-1 md:z-10`}
          >
            <button
              onClick={() => onReply?.(message)}
              className="p-1.5 md:p-1 text-gray-400 hover:text-black transition-colors rounded-md hover:bg-gray-50"
              title="Reply"
            >
              <Reply className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onEdit?.(message)}
              className="p-1.5 md:p-1 text-gray-400 hover:text-black transition-colors rounded-md hover:bg-gray-50"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete?.(message._id)}
              className="p-1.5 md:p-1 text-gray-400 hover:text-red-500 transition-colors rounded-md hover:bg-red-50"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Other's message — reply only */}
        {!isOwn && (
          <div
            className={`flex items-center gap-1 mt-1 ${
              hovering ? 'flex' : 'hidden md:flex md:opacity-0 md:group-hover:opacity-100'
            } md:absolute md:top-0 md:-right-8 md:mt-0 md:bg-white md:border md:border-gray-200 md:rounded-lg md:shadow-sm md:px-1.5 md:py-1 md:z-10`}
          >
            <button
              onClick={() => onReply?.(message)}
              className="p-1.5 md:p-1 text-gray-400 hover:text-black transition-colors rounded-md hover:bg-gray-50"
              title="Reply"
            >
              <Reply className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
