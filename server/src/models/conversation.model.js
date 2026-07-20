import mongoose from 'mongoose';

/**
 * Member subdocument — embedded inside every Conversation.
 * Supports current and future roles without schema migration.
 *
 * Roles hierarchy (lowest → highest privilege):
 *   member → moderator → admin → owner
 */
const memberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Member user ID is required'],
    },

    /** Role within this conversation */
    role: {
      type: String,
      enum: ['owner', 'admin', 'moderator', 'member'],
      default: 'member',
    },

    /** When this user joined the conversation */
    joinedAt: {
      type: Date,
      default: Date.now,
    },

    /**
     * Cursor for unread message calculations.
     * Everything after this timestamp is considered unread for this member.
     */
    lastReadAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false } // No separate _id per member; userId is the unique identifier
);

const conversationSchema = new mongoose.Schema(
  {
    /**
     * Display name of the conversation.
     * Optional — auto-generated from member usernames when omitted.
     */
    name: {
      type: String,
      trim: true,
    },

    /**
     * Icon for the conversation.
     * Stores a Lucide icon name (e.g. 'users') or an S3 URL for uploaded images.
     * Defaults to the Lucide 'users' icon when not provided.
     */
    icon: {
      type: String,
      default: 'users',
    },

    /** Members with their roles and read cursors */
    members: {
      type: [memberSchema],
      validate: {
        validator: (val) => val && val.length >= 1,
        message: 'A conversation must have at least one member',
      },
      required: [true, 'Members list is required'],
    },

    /** true for named group conversations; false for 1-on-1 DMs */
    isGroup: {
      type: Boolean,
      default: false,
    },

    /** The user who originally created this conversation */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator ID is required'],
    },

    /** Reference to the most recent message — used for sidebar previews */
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },

    /**
     * Updated whenever a new message is sent.
     * Drives the sidebar sort order (most recently active first).
     */
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Fast lookup of conversations by member — primary access pattern
conversationSchema.index({ 'members.userId': 1 });

// Sidebar sort: most recently active conversations first
conversationSchema.index({ lastActivityAt: -1 });

// Compound index for DM uniqueness checks (find existing DM between two users)
conversationSchema.index({ 'members.userId': 1, isGroup: 1 });

const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;
