import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
  getMyInvitations,
  respondToInvitation,
} from '../controllers/invitation.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', getMyInvitations);
router.patch('/:id', respondToInvitation);

export default router;
