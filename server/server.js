import http from 'http';
import app from './src/app.js';
import env from './src/configs/env.config.js';
import connectDB from './src/configs/mongo.config.js';
import redis from './src/configs/redis.config.js';
import { initSocket } from './src/configs/socket.config.js';
import mongoose from 'mongoose';

// Importing the mail worker registers and starts the background job processor
import mailWorker from './src/workers/mail.worker.js';

// Connect to MongoDB
connectDB();

const server = http.createServer(app);

// Initialize Socket.io connection
initSocket(server);

server.listen(env.port, () => {
  console.log(`Server running on port ${env.port} in mode: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[MailWorker] Email queue worker is active`);
});

// ── Graceful shutdown — close all connections cleanly ─────────────────────────
const gracefulShutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

  // Stop accepting new HTTP requests
  server.close(() => {
    console.log('HTTP server closed.');
  });

  // Let the mail worker finish its current job before stopping
  try {
    await mailWorker.close();
    console.log('[MailWorker] Mail worker closed.');
  } catch (err) {
    console.error('[MailWorker] Error closing mail worker:', err.message);
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