import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    participants: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
      ],
      validate: {
        validator: function (val) {
          return val && val.length >= 1; // Allow at least 1 participant (e.g. self-chat notes)
        },
        message: 'A conversation must have at least one participant',
      },
      required: [true, 'Participants list is required'],
    },
    isGroup: {
      type: Boolean,
      default: false,
    },
    groupName: {
      type: String,
      trim: true,
      required: [
        function () {
          return this.isGroup;
        },
        'Group name is required for group conversations',
      ],
    },
    groupAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [
        function () {
          return this.isGroup;
        },
        'Group admin is required for group conversations',
      ],
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
    },
  },
  {
    timestamps: true,
  }
);

// Create compound index for participants to speed up conversation searches
conversationSchema.index({ participants: 1 });

const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;
