import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
  createConversation,
  createConversationRateLimit,
  getMyConversations,
  getConversation,
  updateConversation,
  leaveConversation,
  deleteConversation,
} from '../controllers/conversation.controller.js';
import {
  inviteUser,
  sendInvitationRateLimit,
} from '../controllers/invitation.controller.js';
import { sendMessageRateLimit } from '../controllers/message.controller.js';
import {
  getMessages,
  sendMessage,
  markConversationRead,
} from '../controllers/message.controller.js';

const router = Router();

// All conversation routes require authentication
router.use(authenticate);

router.post('/', createConversationRateLimit, createConversation);
router.get('/', getMyConversations);
router.get('/:id', getConversation);
router.patch('/:id', updateConversation);
router.delete('/:id', deleteConversation); // Full deletion (owner only)
router.delete('/:id/leave', leaveConversation); // Leave without deleting

// Invitation — nested under conversation
router.post('/:id/invite', sendInvitationRateLimit, inviteUser);

// Messages — nested under conversation
router.get('/:id/messages', getMessages);
router.post('/:id/messages', sendMessageRateLimit, sendMessage);
router.post('/:id/read', markConversationRead);

export default router;
