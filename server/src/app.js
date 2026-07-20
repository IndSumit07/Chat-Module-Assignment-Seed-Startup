import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import redis from './configs/redis.config.js';
import authRouter from './routes/auth.route.js';
import conversationRouter from './routes/conversation.route.js';
import invitationRouter from './routes/invitation.route.js';
import notificationRouter from './routes/notification.route.js';
import messageRouter from './routes/message.route.js';
import uploadRouter from './routes/upload.route.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

// ── CORS — credentials enabled for cookie-based auth ──────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
}));

// ── Request body and cookie parsers ───────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── API routes ─────────────────────────────────────────────────────────────────
app.use('/api/v1/auth',          authRouter);
app.use('/api/v1/conversations', conversationRouter);
app.use('/api/v1/invitations',   invitationRouter);
app.use('/api/v1/notifications', notificationRouter);
app.use('/api/v1/messages',      messageRouter);
app.use('/api/v1/upload',        uploadRouter);

// ── Static Files ───────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '../../server/uploads')));

// ── Health check — quick sanity check for all connected services ───────────────
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const redisStatus = redis ? redis.status : 'not configured';

  res.status(200).json({
    status: 'OK',
    timestamp: new Date(),
    services: {
      mongodb: dbStatus,
      redis: redisStatus,
    },
  });
});

// ── Global error handler — catches all ApiErrors and unexpected exceptions ─────
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    message,
    errors: err.errors || [],
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

export default app;