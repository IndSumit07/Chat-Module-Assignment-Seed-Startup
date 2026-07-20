import asyncHandler from '../utils/asyncHandler.util.js';
import ApiError from '../utils/apiError.util.js';
import ApiResponse from '../utils/apiResponse.util.js';
import * as InvitationService from '../services/invitation.service.js';
import * as ConversationService from '../services/conversation.service.js';
import * as NotificationService from '../services/notification.service.js';
import { findUserByEmail } from '../services/auth.service.js';
import { invitationEmailQueue, notificationQueue } from '../configs/queue.config.js';
import { publish, channels } from '../services/pubsub.service.js';
import { rateLimitMiddleware } from '../services/ratelimit.service.js';
import env from '../configs/env.config.js';

export const sendInvitationRateLimit = rateLimitMiddleware('sendInvitation');

/**
 * POST /api/v1/conversations/:id/invite
 *
 * Invites a user to a conversation by email or username.
 *
 * Flow:
 *   1. Validate the inviter is a member with invite privileges
 *   2. Check for a duplicate pending invite
 *   3. Look up the target email → resolve to a User if they exist
 *   4. Create the Invitation document
 *   5. If user exists → queue in-app notification + emit socket event
 *   6. Queue invitation email (always)
 */
export const inviteUser = asyncHandler(async (req, res) => {
  const { id: convId } = req.params;
  const { email, message } = req.body;
  const inviter = req.user;

  if (!email) throw new ApiError(400, 'Email is required to send an invitation.');

  const normalizedEmail = email.toLowerCase().trim();

  // Verify inviter is a member of this conversation
  const isMember = await ConversationService.isUserMember(convId, inviter._id.toString());
  if (!isMember) throw new ApiError(403, 'You are not a member of this conversation.');

  // Prevent duplicate pending invites
  const alreadyInvited = await InvitationService.hasExistingInvite(convId, normalizedEmail);
  if (alreadyInvited) {
    throw new ApiError(409, 'A pending invitation already exists for this email.');
  }

  // Resolve email to an existing user
  const targetUser = await findUserByEmail(normalizedEmail);

  // Prevent inviting someone already in the conversation
  if (targetUser) {
    const alreadyMember = await ConversationService.isUserMember(convId, targetUser._id.toString());
    if (alreadyMember) {
      throw new ApiError(409, 'This user is already a member of the conversation.');
    }
  }

  // Fetch conversation details for email template
  const conversation = await ConversationService.findConversationById(convId);
  if (!conversation) throw new ApiError(404, 'Conversation not found.');

  // Create the invitation
  const invitation = await InvitationService.createInvitation({
    conversationId: convId,
    invitedBy: inviter._id,
    invitedUserId: targetUser?._id || null,
    invitedEmail: normalizedEmail,
    message: message?.trim() || undefined,
  });

  // Queue in-app notification for existing users
  if (targetUser) {
    await notificationQueue.add('invitation', {
      recipientId: targetUser._id.toString(),
      type: 'invitation',
      title: `${inviter.username} invited you to ${conversation.name || 'a conversation'}`,
      body: message || `You've been invited to join a conversation on Chat Service.`,
      data: {
        invitationId: invitation._id.toString(),
        conversationId: convId,
        conversationName: conversation.name,
        invitedBy: inviter.username,
      },
    });

    // Also publish directly to the user's socket room for instant in-app update
    await publish(channels.invitation(targetUser._id.toString()), {
      invitation: {
        ...invitation.toObject(),
        conversationId: conversation.toObject(),
        invitedBy: {
          _id: inviter._id,
          username: inviter.username,
          avatarUrl: inviter.avatarUrl,
        },
      },
    });
  }

  // Queue invitation email (for both existing users and pending email-only invites)
  const clientBaseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  await invitationEmailQueue.add('invitation-email', {
    toEmail: normalizedEmail,
    toName: targetUser?.username || normalizedEmail,
    inviterName: inviter.username,
    inviterAvatar: inviter.avatarUrl || '',
    conversationName: conversation.name || 'a conversation',
    conversationIcon: conversation.icon || 'users',
    message: message || '',
    acceptUrl: `${clientBaseUrl}/invitations/${invitation._id}/accept`,
    rejectUrl: `${clientBaseUrl}/invitations/${invitation._id}/reject`,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, `Invitation sent to ${normalizedEmail}.`, invitation));
});

/**
 * PATCH /api/v1/invitations/:id
 *
 * Accepts or rejects an invitation.
 *
 * Body: { action: 'accept' | 'reject' }
 *
 * On accept:
 *   - Adds the user to the conversation as a member
 *   - Invalidates the conversation cache
 *   - Broadcasts conversation:updated to all members
 */
export const respondToInvitation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;
  const userId = req.user._id.toString();

  if (!['accept', 'reject'].includes(action)) {
    throw new ApiError(400, 'Action must be either "accept" or "reject".');
  }

  const invitation = await InvitationService.findInvitationById(id);
  if (!invitation) throw new ApiError(404, 'Invitation not found.');

  // Security: only the invited user may respond
  // (invitedUserId is populated by the service, so we check ._id)
  if (invitation.invitedUserId?._id?.toString() !== userId) {
    throw new ApiError(403, 'You are not the recipient of this invitation.');
  }

  if (invitation.status !== 'pending') {
    throw new ApiError(400, `This invitation has already been ${invitation.status}.`);
  }

  if (action === 'accept') {
    await Promise.all([
      InvitationService.acceptInvitation(id),
      ConversationService.addMember(invitation.conversationId._id.toString(), userId, 'member'),
    ]);

    // Invalidate cache and broadcast the updated conversation to the room
    const convId = invitation.conversationId._id.toString();
    const updatedConv = await ConversationService.findConversationById(convId);

    const { invalidateConversation } = await import('../services/cache.service.js');
    await invalidateConversation(convId);

    await publish(channels.conversationUpdated(convId), { conversation: updatedConv });

    return res
      .status(200)
      .json(new ApiResponse(200, 'Invitation accepted. You have joined the conversation.', updatedConv));
  }

  // Reject
  await InvitationService.rejectInvitation(id);

  return res
    .status(200)
    .json(new ApiResponse(200, 'Invitation rejected.'));
});

/**
 * GET /api/v1/invitations
 *
 * Returns all pending invitations for the authenticated user.
 */
export const getMyInvitations = asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();

  const invitations = await InvitationService.getUserInvitations(userId);

  return res
    .status(200)
    .json(new ApiResponse(200, 'Invitations fetched successfully.', invitations));
});
