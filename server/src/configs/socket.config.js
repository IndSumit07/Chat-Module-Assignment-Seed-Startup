import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

import User from '../models/user.model.js';
import env from './env.config.js';
import { initPubSub } from '../services/pubsub.service.js';
import { registerChatHandlers } from '../sockets/chat.socket.js';
import { registerTypingHandlers } from '../sockets/typing.socket.js';
import { registerPresenceHandlers } from '../sockets/presence.socket.js';
import { registerNotificationHandlers } from '../sockets/notification.socket.js';

let io = null;

/**
 * Initializes Socket.io with:
 *   1. JWT cookie authentication middleware
 *   2. Modular event handler registration
 *   3. Redis pub/sub subscriber bootstrapping
 *
 * @param {import('http').Server} server
 * @returns {import('socket.io').Server}
 */
export const initSocket = async (server) => {
  io = new Server(server, {
    cors: {
      origin: true, // Allow true origin reflection for cross-origin credentials
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Ping settings: detect dead connections within ~45s
    pingTimeout: 30000,
    pingInterval: 25000,
  });

  // ── Authentication Middleware ────────────────────────────────────────────────
  // Runs before the 'connection' event — rejects unauthenticated sockets.
  io.use(async (socket, next) => {
    try {
      // Extract JWT from cookie (preferred) or from socket.handshake.auth.token
      let token = socket.handshake.auth?.token;

      if (!token && socket.handshake.headers.cookie) {
        // Inline cookie parse — avoids a dependency on the cookie package's ESM export quirks
        const rawCookie = socket.handshake.headers.cookie;
        const match = rawCookie.match(/(?:^|;\s*)accessToken=([^;]*)/);
        token = match ? decodeURIComponent(match[1]) : undefined;
      }

      if (!token) {
        return next(new Error('Authentication required. No token provided.'));
      }

      const decoded = jwt.verify(token, env.jwt.secret);
      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        return next(new Error('Authentication failed. User not found.'));
      }

      if (!user.isVerified) {
        return next(new Error('Authentication failed. Account not verified.'));
      }

      // Attach the user to the socket — available in all handlers
      socket.user = user;
      next();

    } catch (err) {
      return next(new Error('Authentication failed. Invalid or expired token.'));
    }
  });

  // ── Connection Handler ───────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    console.log(`[Socket] Connected: ${socket.id} (user: ${socket.user.username})`);

    // Join the user's personal room — used for direct user-targeted events
    socket.join(`user:${userId}`);

    // Register all modular event handlers
    registerPresenceHandlers(io, socket);
    registerChatHandlers(io, socket);
    registerTypingHandlers(io, socket);
    registerNotificationHandlers(io, socket);

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected: ${socket.id} (user: ${socket.user.username}) — ${reason}`);
    });

    socket.on('error', (err) => {
      console.error(`[Socket] Error on socket ${socket.id}:`, err.message);
    });
  });

  // ── Redis Pub/Sub Initialization ─────────────────────────────────────────────
  // Must run after io is set so getIO() resolves correctly inside the pub/sub handler
  await initPubSub();

  return io;
};

/**
 * Returns the initialized Socket.io server instance.
 * Throws if called before initSocket().
 *
 * @returns {import('socket.io').Server}
 */
export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io has not been initialized. Call initSocket(server) first.');
  }
  return io;
};
