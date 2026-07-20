import Redis from 'ioredis';
import env from './env.config.js';

const redis = new Redis({
  host: env.redis.host,
  port: env.redis.port,
  password: env.redis.password,
  // Retry strategy to avoid infinite hanging and log connection retry efforts
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

redis.on('connect', () => {
  console.log('Redis connected successfully');
});

redis.on('error', (error) => {
  console.error(`Redis connection error: ${error.message}`);
});

export default redis;
