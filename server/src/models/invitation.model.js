import mongoose from 'mongoose';

/**
 * Invitation — represents a request to join a conversation.
 *
 * Two invitation paths:
 *   1. Existing user: invitedUserId is set; notification delivered instantly.
 *   2. Non-existent email: invitedUserId is null; auto-claimed on registration.
 */
const invitationSchema = new mongoose.Schema(
  {
    /** The conversation the invitee is being invited to */
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: [true, 'Conversation ID is required'],
      index: true,
    },

    /** The user who sent the invitation */
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Inviter ID is required'],
    },

    /**
     * The invited user's ObjectId — null for pending invitations
     * where the email does not yet belong to any registered account.
     */
    invitedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    /**
     * Always stored regardless of whether the user exists.
     * Used to match and auto-claim the invitation on registration.
     */
    invitedEmail: {
      type: String,
      required: [true, 'Invited email is required'],
      lowercase: true,
      trim: true,
      index: true,
    },

    /** Optional personalized message from the inviter */
    message: {
      type: String,
      trim: true,
      maxlength: [500, 'Invitation message cannot exceed 500 characters'],
    },

    /** Invitation lifecycle status */
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'expired'],
      default: 'pending',
      index: true,
    },

    /** When the invitee responded (accepted or rejected) */
    respondedAt: {
      type: Date,
      default: null,
    },

    /**
     * Hard expiry date — invitations automatically expire after 7 days.
     * A scheduled cleanup job sets status='expired' on stale records.
     */
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // +7 days
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate pending invitations to the same conversation
invitationSchema.index(
  { conversationId: 1, invitedEmail: 1, status: 1 },
  { unique: false } // Not unique — allows re-invite after rejection/expiry
);

// Fast lookup of all pending invitations for a registered user
invitationSchema.index({ invitedUserId: 1, status: 1 });

const Invitation = mongoose.model('Invitation', invitationSchema);
export default Invitation;
