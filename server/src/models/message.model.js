import mongoose from 'mongoose';

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
      type: Number, // size in bytes
    },
  },
  {
    _id: true, // Generate individual subdocument IDs for each attachment
  }
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
    text: {
      type: String,
      trim: true,
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Pre-validation hook to ensure the message has content (either text, attachments, or both)
messageSchema.pre('validate', function () {
  if (!this.text && (!this.attachments || this.attachments.length === 0)) {
    this.invalidate('text', 'Message must contain either text or at least one attachment');
  }
});

// Indexes for sorting/paginating messages inside a conversation by time
messageSchema.index({ conversationId: 1, createdAt: -1 });

const Message = mongoose.model('Message', messageSchema);
export default Message;