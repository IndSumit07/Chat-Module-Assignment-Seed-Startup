import app from './src/app.js';
import env from './src/configs/env.config.js';
import connectDB from './src/configs/mongo.config.js';
import redis from './src/configs/redis.config.js';
import mongoose from 'mongoose';

// Connect to MongoDB
connectDB();

const server = app.listen(env.port, () => {
  console.log(`Server running on port ${env.port} in mode: ${process.env.NODE_ENV || 'development'}`);
});

// Handle graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
  
  // Close HTTP server
  server.close(() => {
    console.log('HTTP server closed.');
  });

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