import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
  getMyNotifications,
  markRead,
  markAllRead,
} from '../controllers/notification.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', getMyNotifications);
router.patch('/read-all', markAllRead);       // Must come before /:id to avoid route conflict
router.patch('/:id/read', markRead);

export default router;
