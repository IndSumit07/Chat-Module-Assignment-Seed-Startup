import { useEffect, useRef } from 'react';

/**
 * TypingIndicator — animated "X is typing..." display.
 *
 * Accepts a list of typing user objects { userId, username? }.
 * Returns null when no one is typing.
 *
 * Examples:
 *   []                           → null (hidden)
 *   [{ username: 'Alice' }]      → "Alice is typing..."
 *   [{ username: 'Alice' }, { username: 'Bob' }] → "Alice and Bob are typing..."
 *   3 or more                    → "Alice, Bob and 2 others are typing..."
 */
export default function TypingIndicator({ typingUsers = [], memberMap = {} }) {
  if (typingUsers.length === 0) return null;

  const getName = (u) => u.username || memberMap[u.userId]?.username || 'Someone';

  let label;
  if (typingUsers.length === 1) {
    label = `${getName(typingUsers[0])} is typing`;
  } else if (typingUsers.length === 2) {
    label = `${getName(typingUsers[0])} and ${getName(typingUsers[1])} are typing`;
  } else {
    const rest = typingUsers.length - 2;
    label = `${getName(typingUsers[0])}, ${getName(typingUsers[1])} and ${rest} other${rest > 1 ? 's' : ''} are typing`;
  }

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-gray-400">
      {/* Animated dots */}
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
            style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.8s' }}
          />
        ))}
      </span>
      <span className="italic">{label}…</span>
    </div>
  );
}
