import mongoose from 'mongoose';

/**
 * Attachment subdocument — supports images, files, video, and audio.
 * S3 URL is always stored; mimeType and size are metadata for rendering.
 */
const attachmentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['image', 'file', 'video', 'audio'],
      required: [true, 'Attachment type is required'],
    },
    url: {
      type: String,
      required: [true, 'Attachment S3 URL is required'],
      trim: true,
    },
    filename: {
      type: String,
      required: [true, 'Original filename is required'],
      trim: true,
    },
    mimeType: {
      type: String,
      trim: true,
    },
    size: {
      type: Number, // Size in bytes
    },
  },
  { _id: true } // Individual IDs for each attachment (e.g. for deletion)
);

/**
 * Read receipt subdocument — one entry per user who has read the message.
 */
const readReceiptSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    readAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/**
 * Delivery receipt subdocument — one entry per user the message was delivered to.
 */
const deliveryReceiptSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deliveredAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: [true, 'Conversation ID is required'],
      index: true,
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Sender ID is required'],
      index: true,
    },

    /** Plain text body — optional when attachments are present */
    text: {
      type: String,
      trim: true,
    },

    /** Attached media — populated by the S3 upload flow */
    attachments: {
      type: [attachmentSchema],
      default: [],
    },

    /**
     * Optional reply threading.
     * Stores the _id of the message being replied to.
     */
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },

    /**
     * Delivery lifecycle status.
     * Progresses: sending → sent → delivered → read
     * Set to 'failed' if persistence or delivery fails.
     */
    status: {
      type: String,
      enum: ['sending', 'sent', 'delivered', 'read', 'failed'],
      default: 'sent',
    },

    /** Toggled to true when the sender edits the message text */
    isEdited: {
      type: Boolean,
      default: false,
    },

    /**
     * Soft-delete flag — message is hidden from clients but preserved in DB.
     * Useful for moderation audits and thread integrity.
     */
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    /** Set when isDeleted becomes true */
    deletedAt: {
      type: Date,
      default: null,
    },

    /** Per-user read receipts — pushed as each member reads the message */
    readBy: {
      type: [readReceiptSchema],
      default: [],
    },

    /** Per-user delivery receipts — pushed on socket delivery confirmation */
    deliveredTo: {
      type: [deliveryReceiptSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Ensure every message has at least text or one attachment
messageSchema.pre('validate', function () {
  if (!this.text && (!this.attachments || this.attachments.length === 0)) {
    this.invalidate('text', 'Message must contain either text or at least one attachment');
  }
});

// Primary access pattern: paginate messages within a conversation, newest first
messageSchema.index({ conversationId: 1, createdAt: -1 });

// Efficiently filter out soft-deleted messages in conversation queries
messageSchema.index({ conversationId: 1, isDeleted: 1, createdAt: -1 });

const Message = mongoose.model('Message', messageSchema);
export default Message;