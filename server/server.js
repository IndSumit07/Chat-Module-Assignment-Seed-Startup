import http from 'http';
import app from './src/app.js';
import env from './src/configs/env.config.js';
import connectDB from './src/configs/mongo.config.js';
import redis from './src/configs/redis.config.js';
import { initSocket } from './src/configs/socket.config.js';
import mongoose from 'mongoose';

// ── Background Workers — importing registers and starts each job processor ─────
import mailWorker from './src/workers/mail.worker.js';
import invitationWorker from './src/workers/invitation.worker.js';
import notificationWorker from './src/workers/notification.worker.js';

// Connect to MongoDB
connectDB();

const server = http.createServer(app);

// Bootstrap function — ensures pub/sub is initialized before listening
const start = async () => {
  // initSocket is async because it bootstraps the Redis pub/sub subscriber
  await initSocket(server);

  server.listen(env.port, () => {
    console.log(`Server running on port ${env.port} in mode: ${process.env.NODE_ENV || 'development'}`);
    console.log('[Workers] Mail, Invitation, and Notification workers are active');
  });
};

start();

// ── Graceful shutdown — close all connections and workers cleanly ──────────────
const gracefulShutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

  // Stop accepting new HTTP requests
  server.close(() => {
    console.log('HTTP server closed.');
  });

  // Close all workers — waits for in-progress jobs to finish
  const workers = [
    { worker: mailWorker, name: 'MailWorker' },
    { worker: invitationWorker, name: 'InvitationWorker' },
    { worker: notificationWorker, name: 'NotificationWorker' },
  ];

  for (const { worker, name } of workers) {
    try {
      await worker.close();
      console.log(`[${name}] Closed.`);
    } catch (err) {
      console.error(`[${name}] Error closing:`, err.message);
    }
  }

  // Close MongoDB connection
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
  } catch (err) {
    console.error('Error closing MongoDB connection:', err.message);
  }

  // Close Redis connection
  if (redis) {
    try {
      await redis.quit();
      console.log('Redis connection closed.');
    } catch (err) {
      console.error('Error closing Redis connection:', err.message);
    }
  }

  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));