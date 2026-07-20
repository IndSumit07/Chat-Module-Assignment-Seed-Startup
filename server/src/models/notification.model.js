import mongoose from 'mongoose';

/**
 * Notification — an in-app notification delivered to a single user.
 *
 * The `data` field carries type-specific context payloads so the client
 * can route the user to the correct screen without additional API calls.
 *
 * Payload shapes by type:
 *   'invitation'  → { invitationId, conversationId, conversationName, invitedBy }
 *   'message'     → { messageId, conversationId, conversationName, senderName }
 *   'system'      → { action }
 */
const notificationSchema = new mongoose.Schema(
  {
    /** The user this notification belongs to */
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Recipient ID is required'],
      index: true,
    },

    /** Notification category — drives client-side rendering and routing */
    type: {
      type: String,
      enum: ['invitation', 'message', 'system'],
      required: [true, 'Notification type is required'],
    },

    /** Short display title shown in the notification center */
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
    },

    /** Longer description body */
    body: {
      type: String,
      required: [true, 'Notification body is required'],
      trim: true,
    },

    /**
     * Type-specific payload for client routing and rendering.
     * Kept as Mixed so future notification types never require schema changes.
     */
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    /** Whether the user has seen / dismissed this notification */
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    /** Timestamp when the user explicitly read/dismissed this notification */
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Primary access pattern: fetch all unread notifications for a user, newest first
notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
