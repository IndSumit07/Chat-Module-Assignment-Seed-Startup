import Message from '../models/message.model.js';

/**
 * All MongoDB operations for messages live here.
 * Controllers and socket handlers never touch Mongoose directly.
 */

/**
 * Persists a new message document.
 *
 * @param {object} data  — { conversationId, sender, text?, attachments?, replyTo? }
 * @returns {Promise<Document>}
 */
export const createMessage = (data) => Message.create(data);

/**
 * Fetches a paginated slice of messages for a conversation using cursor-based pagination.
 *
 * Cursor is the `createdAt` of the oldest message already loaded on the client.
 * Messages older than the cursor are returned, newest-first.
 *
 * @param {string}  convId
 * @param {Date|null} cursor   — Load messages older than this timestamp; null for initial load
 * @param {number}  limit     — Page size (default 40)
 * @returns {Promise<Document[]>}  Ordered newest-first
 */
export const getMessages = (convId, cursor = null, limit = 40) => {
  const query = {
    conversationId: convId,
    isDeleted: false,
    ...(cursor && { createdAt: { $lt: new Date(cursor) } }),
  };

  return Message.find(query)
    .populate('sender', 'username avatarUrl')
    .populate({
      path: 'replyTo',
      select: 'text sender isDeleted',
      populate: { path: 'sender', select: 'username' },
    })
    .sort({ createdAt: -1 })
    .limit(limit);
};

/**
 * Finds a single message by ID with sender populated.
 *
 * @param {string} id
 * @returns {Promise<Document|null>}
 */
export const findMessageById = (id) =>
  Message.findById(id).populate('sender', 'username avatarUrl');

/**
 * Updates a message's text and marks it as edited.
 * Only the original sender may edit their own messages — enforce this in the controller.
 *
 * @param {string} id
 * @param {string} text  — New message text
 * @returns {Promise<Document|null>}
 */
export const editMessage = (id, text) =>
  Message.findByIdAndUpdate(
    id,
    { $set: { text, isEdited: true } },
    { returnDocument: 'after' }
  ).populate('sender', 'username avatarUrl');

/**
 * Soft-deletes a message — sets isDeleted=true and records deletedAt.
 * The document is retained in the database for audit and thread integrity.
 *
 * @param {string} id
 * @returns {Promise<Document|null>}
 */
export const softDeleteMessage = (id) =>
  Message.findByIdAndUpdate(
    id,
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { returnDocument: 'after' }
  );

/**
 * Records a delivery receipt for a specific user on a message.
 * Skips silently if the user has already been recorded.
 *
 * @param {string} messageId
 * @param {string} userId
 */
export const markDelivered = (messageId, userId) =>
  Message.findOneAndUpdate(
    { _id: messageId, 'deliveredTo.userId': { $ne: userId } },
    { $push: { deliveredTo: { userId, deliveredAt: new Date() } } }
  );

/**
 * Marks all unread messages in a conversation as read for a user.
 * Adds a readBy entry to every message that doesn't already have one for this user.
 *
 * @param {string} convId
 * @param {string} userId
 * @param {Date}   afterDate  — Only mark messages created after the user's lastReadAt cursor
 * @returns {Promise<import('mongoose').UpdateWriteOpResult>}
 */
export const markConversationRead = (convId, userId, afterDate) =>
  Message.updateMany(
    {
      conversationId: convId,
      sender: { $ne: userId },
      isDeleted: false,
      createdAt: { $gte: afterDate },
      'readBy.userId': { $ne: userId },
    },
    { $push: { readBy: { userId, readAt: new Date() } }, $set: { status: 'read' } }
  );

/**
 * Returns the count of unread messages for a user in a conversation.
 * Used as a fallback when the Redis unread counter is unavailable.
 *
 * @param {string} convId
 * @param {string} userId
 * @param {Date}   afterDate  — The user's lastReadAt cursor
 * @returns {Promise<number>}
 */
export const getUnreadCountFromDB = (convId, userId, afterDate) =>
  Message.countDocuments({
    conversationId: convId,
    sender: { $ne: userId },
    isDeleted: false,
    createdAt: { $gte: afterDate },
    'readBy.userId': { $ne: userId },
  });
