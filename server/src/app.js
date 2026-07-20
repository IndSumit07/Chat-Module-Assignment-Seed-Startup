import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import redis from './configs/redis.config.js';

const app = express();

// CORS configuration supporting credentials and common origins
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or postman)
    if (!origin) return callback(null, true);
    // Allow all origins or customize this regex/list as needed
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
}));

// Request body and cookie parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health Check endpoint to monitor service and connection statuses
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const redisStatus = redis ? redis.status : 'not configured';
  
  res.status(200).json({
    status: 'OK',
    timestamp: new Date(),
    services: {
      mongodb: dbStatus,
      redis: redisStatus
    }
  });
});

export default app;