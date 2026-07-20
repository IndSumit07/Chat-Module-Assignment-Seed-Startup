import { useState, useEffect, useCallback } from 'react';

/**
 * usePresence — subscribes to real-time presence updates for a list of user IDs.
 *
 * On mount: requests a snapshot of current presence from the server.
 * On 'presence:changed': updates local state for the affected user.
 *
 * @param {import('socket.io-client').Socket|null} socket
 * @param {string[]} userIds  — IDs to watch
 * @returns {Record<string, { status: 'online'|'offline', lastSeen: string|null }>}
 */
const usePresence = (socket, userIds = []) => {
  const [presenceMap, setPresenceMap] = useState({});

  // Request initial snapshot when userIds or socket changes
  useEffect(() => {
    if (!socket || userIds.length === 0) return;

    socket.emit('presence:get', { userIds });
  }, [socket, userIds.join(',')]);

  // Handle snapshot (initial bulk response)
  useEffect(() => {
    if (!socket) return;

    const handleSnapshot = ({ presenceMap: snapshot }) => {
      setPresenceMap((prev) => ({ ...prev, ...snapshot }));
    };

    socket.on('presence:snapshot', handleSnapshot);
    return () => socket.off('presence:snapshot', handleSnapshot);
  }, [socket]);

  // Handle real-time individual presence changes
  useEffect(() => {
    if (!socket) return;

    const handleChange = ({ userId, status, lastSeen }) => {
      setPresenceMap((prev) => ({
        ...prev,
        [userId]: { status, lastSeen },
      }));
    };

    socket.on('presence:changed', handleChange);
    return () => socket.off('presence:changed', handleChange);
  }, [socket]);

  /**
   * Returns the status for a single user.
   *
   * @param {string} userId
   * @returns {'online'|'offline'}
   */
  const getStatus = useCallback(
    (userId) => presenceMap[userId]?.status || 'offline',
    [presenceMap]
  );

  return { presenceMap, getStatus };
};

export default usePresence;
