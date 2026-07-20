import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import redis from './configs/redis.config.js';
import authRouter from './routes/auth.route.js';

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
app.use('/api/v1/auth', authRouter);

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