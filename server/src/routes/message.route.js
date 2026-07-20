import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
  editMessage,
  deleteMessage,
} from '../controllers/message.controller.js';

const router = Router();

router.use(authenticate);

router.patch('/:id', editMessage);
router.delete('/:id', deleteMessage);

export default router;
