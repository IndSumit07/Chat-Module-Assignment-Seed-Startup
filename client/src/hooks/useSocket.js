import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:4000';

let socketInstance = null;

/**
 * useSocket — returns a singleton Socket.io connection for the authenticated user.
 *
 * The socket is created once per application session. The singleton pattern
 * prevents duplicate connections when multiple components call this hook.
 *
 * Authentication uses the httpOnly cookie — the socket handshake includes
 * credentials so the browser sends the cookie automatically.
 *
 * @param {boolean} enabled  — Set to false to defer connection (e.g. before login)
 * @returns {import('socket.io-client').Socket|null}
 */
const useSocket = (enabled = true) => {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    if (!socketInstance) {
      socketInstance = io(SOCKET_URL, {
        withCredentials: true,  // Sends the httpOnly accessToken cookie
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      socketInstance.on('connect', () => {
        console.log('[Socket] Connected:', socketInstance.id);
      });

      socketInstance.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
      });

      socketInstance.on('connect_error', (err) => {
        console.error('[Socket] Connection error:', err.message);
      });
    }

    socketRef.current = socketInstance;

    return () => {
      // Do NOT disconnect on component unmount — socket is a singleton
      // It will be disconnected when the user logs out
    };
  }, [enabled]);

  return socketRef.current;
};

/**
 * Disconnects and destroys the socket singleton.
 * Call this on user logout.
 */
export const disconnectSocket = () => {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
};

export default useSocket;
