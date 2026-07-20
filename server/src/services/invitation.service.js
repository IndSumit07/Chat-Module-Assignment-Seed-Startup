import Invitation from '../models/invitation.model.js';

/**
 * All MongoDB operations for invitations live here.
 */

/**
 * Creates a new invitation document.
 *
 * @param {object} data  — { conversationId, invitedBy, invitedUserId?, invitedEmail, message? }
 * @returns {Promise<Document>}
 */
export const createInvitation = (data) => Invitation.create(data);

/**
 * Finds an invitation by its ID, populating conversation and inviter details.
 *
 * @param {string} id
 * @returns {Promise<Document|null>}
 */
export const findInvitationById = (id) =>
  Invitation.findById(id)
    .populate('conversationId', 'name icon members')
    .populate('invitedBy', 'username email avatarUrl')
    .populate('invitedUserId', 'username email avatarUrl');

/**
 * Returns all pending invitations for a given user.
 *
 * @param {string} userId
 * @returns {Promise<Document[]>}
 */
export const getUserInvitations = (userId) =>
  Invitation.find({ invitedUserId: userId, status: 'pending' })
    .populate('conversationId', 'name icon')
    .populate('invitedBy', 'username email avatarUrl')
    .sort({ createdAt: -1 });

/**
 * Finds all pending invitations for an email address.
 * Used on registration to auto-claim invitations sent before the account existed.
 *
 * @param {string} email
 * @returns {Promise<Document[]>}
 */
export const findPendingByEmail = (email) =>
  Invitation.find({
    invitedEmail: email.toLowerCase().trim(),
    status: 'pending',
  });

/**
 * Checks whether an active (pending) invitation already exists for this email/conversation pair.
 * Prevents duplicate invites.
 *
 * @param {string} convId
 * @param {string} email
 * @returns {Promise<boolean>}
 */
export const hasExistingInvite = async (convId, email) => {
  const count = await Invitation.countDocuments({
    conversationId: convId,
    invitedEmail: email.toLowerCase().trim(),
    status: 'pending',
  });
  return count > 0;
};

/**
 * Updates the invitation status to 'accepted' and records the response time.
 *
 * @param {string} invitationId
 * @returns {Promise<Document|null>}
 */
export const acceptInvitation = (invitationId) =>
  Invitation.findByIdAndUpdate(
    invitationId,
    { $set: { status: 'accepted', respondedAt: new Date() } },
    { returnDocument: 'after' }
  );

/**
 * Updates the invitation status to 'rejected' and records the response time.
 *
 * @param {string} invitationId
 * @returns {Promise<Document|null>}
 */
export const rejectInvitation = (invitationId) =>
  Invitation.findByIdAndUpdate(
    invitationId,
    { $set: { status: 'rejected', respondedAt: new Date() } },
    { returnDocument: 'after' }
  );

/**
 * Claims all pending email invitations for a newly registered user.
 * Sets their userId on all matching records so they appear in getMyInvitations.
 *
 * @param {string} email
 * @param {string} userId
 * @returns {Promise<import('mongoose').UpdateWriteOpResult>}
 */
export const claimPendingInvitations = (email, userId) =>
  Invitation.updateMany(
    { invitedEmail: email.toLowerCase().trim(), status: 'pending' },
    { $set: { invitedUserId: userId } }
  );
