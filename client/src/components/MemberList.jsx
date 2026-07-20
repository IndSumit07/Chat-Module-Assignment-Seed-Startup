import { Users, MessageSquare } from 'lucide-react';

/**
 * MemberList — shows all members of a conversation with their online/offline status.
 *
 * @param {object[]} members      — Populated member objects from the conversation
 * @param {Function} getStatus    — From usePresence: (userId) => 'online'|'offline'
 */
export default function MemberList({ members = [], getStatus }) {
  const online = members.filter((m) => getStatus(m.userId._id) === 'online');
  const offline = members.filter((m) => getStatus(m.userId._id) !== 'online');

  const MemberRow = ({ member }) => {
    const user = member.userId;
    const status = getStatus(user._id);
    const initials = user.username?.slice(0, 2).toUpperCase() || '??';

    return (
      <div className="flex items-center gap-2.5 py-1.5 px-3 rounded-lg hover:bg-gray-50 transition-colors">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.username}
              className="w-7 h-7 rounded-lg object-cover"
            />
          ) : (
            <div className="w-7 h-7 bg-black rounded-lg flex items-center justify-center">
              <span className="text-white text-[10px] font-semibold">{initials}</span>
            </div>
          )}
          {/* Presence dot */}
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-white ${
              status === 'online' ? 'bg-green-500' : 'bg-gray-300'
            }`}
          />
        </div>

        {/* Name + role */}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-black truncate">{user.username}</p>
          {member.role !== 'member' && (
            <p className="text-[10px] text-gray-400 capitalize">{member.role}</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto py-3">
      {online.length > 0 && (
        <div className="mb-3">
          <p className="px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Online — {online.length}
          </p>
          {online.map((m) => (
            <MemberRow key={m.userId._id} member={m} />
          ))}
        </div>
      )}

      {offline.length > 0 && (
        <div>
          <p className="px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Offline — {offline.length}
          </p>
          {offline.map((m) => (
            <MemberRow key={m.userId._id} member={m} />
          ))}
        </div>
      )}

      {members.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2">
          <Users className="w-8 h-8" />
          <p className="text-xs">No members</p>
        </div>
      )}
    </div>
  );
}
