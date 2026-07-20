import { Check, CheckCheck, Trash2, Pencil, Reply, FileText } from 'lucide-react';
import { useState } from 'react';

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

      <div className={`relative max-w-[75%] flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
        
        {/* Username above the first bubble in a group */}
        {!isOwn && showSenderInfo && (
          <span className="text-xs font-semibold text-gray-500 mb-1 ml-1">
            {message.sender?.username}
          </span>
        )}

        {/* Reply preview */}
        {message.replyTo && !message.replyTo.isDeleted && (
          <div
            className={`text-xs text-gray-500 border-l-2 border-gray-300 pl-2 mb-1 truncate ${
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
                      className="max-h-60 max-w-full rounded-lg object-contain cursor-pointer hover:opacity-90 transition-opacity"
                    />
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-black/10 rounded-lg hover:bg-black/20 transition-colors">
                      <FileText className="w-6 h-6" />
                      <div className="flex flex-col max-w-[150px]">
                        <span className="text-sm font-medium truncate">{att.filename}</span>
                        <span className="text-[10px] opacity-70">
                          {(att.size / 1024).toFixed(1)} KB
                        </span>
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
          
          {/* Clearfix for the floated timestamp if needed */}
          <div className="clear-both"></div>
        </div>

        {/* Action buttons (own message hover) */}
        {isOwn && hovering && (
          <div className="absolute top-0 -left-20 flex items-center gap-1 bg-white border border-gray-200 rounded-lg shadow-sm px-1.5 py-1 z-10 animate-in fade-in zoom-in duration-150">
            <button
              onClick={() => onReply?.(message)}
              className="text-gray-400 hover:text-black transition-colors p-1"
              title="Reply"
            >
              <Reply className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onEdit?.(message)}
              className="text-gray-400 hover:text-black transition-colors p-1"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete?.(message._id)}
              className="text-gray-400 hover:text-red-500 transition-colors p-1"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Reply button (other's message hover) */}
        {!isOwn && hovering && (
          <div className="absolute top-0 -right-8 flex items-center bg-white border border-gray-200 rounded-lg shadow-sm px-1.5 py-1 z-10 animate-in fade-in zoom-in duration-150">
            <button
              onClick={() => onReply?.(message)}
              className="text-gray-400 hover:text-black transition-colors p-1"
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
