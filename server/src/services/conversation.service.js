import Conversation from '../models/conversation.model.js';
import Message from '../models/message.model.js';
import Invitation from '../models/invitation.model.js';
import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';

// Initialize S3 client for deletion
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * All MongoDB operations for conversations live here.
 * Controllers and socket handlers never touch Mongoose directly.
 */

/**
 * Creates a new conversation document.
 *
 * @param {object} data  — { name?, icon?, members, isGroup, createdBy, lastActivityAt }
 * @returns {Promise<Document>}
 */
export const createConversation = (data) => Conversation.create(data);

/**
 * Finds a single conversation by ID, populating member user details and lastMessage.
 *
 * @param {string} id
 * @returns {Promise<Document|null>}
 */
export const findConversationById = (id) =>
  Conversation.findById(id)
    .populate('members.userId', 'username email avatarUrl isVerified')
    .populate({ path: 'lastMessage', populate: { path: 'sender', select: 'username avatarUrl' } });

/**
 * Returns all conversations where the given user is a member,
 * sorted by most recently active first (sidebar order).
 *
 * @param {string} userId
 * @returns {Promise<Document[]>}
 */
export const getUserConversations = (userId) =>
  Conversation.find({ 'members.userId': userId })
    .populate('members.userId', 'username email avatarUrl')
    .populate({ path: 'lastMessage', populate: { path: 'sender', select: 'username avatarUrl' } })
    .sort({ lastActivityAt: -1 });

/**
 * Adds a new member to the conversation with the given role.
 * Uses $push to append to the members array atomically.
 *
 * @param {string} convId
 * @param {string} userId
 * @param {string} role    — 'owner' | 'admin' | 'moderator' | 'member'
 * @returns {Promise<Document|null>}
 */
export const addMember = (convId, userId, role = 'member') =>
  Conversation.findByIdAndUpdate(
    convId,
    { $push: { members: { userId, role, joinedAt: new Date(), lastReadAt: new Date() } } },
    { returnDocument: 'after' }
  );

/**
 * Removes a member from the conversation.
 *
 * @param {string} convId
 * @param {string} userId
 * @returns {Promise<Document|null>}
 */
export const removeMember = (convId, userId) =>
  Conversation.findByIdAndUpdate(
    convId,
    { $pull: { members: { userId } } },
    { returnDocument: 'after' }
  );

/**
 * Updates the lastReadAt cursor for a specific member.
 * Used to calculate per-user unread counts.
 *
 * @param {string} convId
 * @param {string} userId
 * @returns {Promise<Document|null>}
 */
export const updateMemberLastRead = (convId, userId) =>
  Conversation.findOneAndUpdate(
    { _id: convId, 'members.userId': userId },
    { $set: { 'members.$.lastReadAt': new Date() } },
    { returnDocument: 'after' }
  );

/**
 * Updates the lastMessage reference and lastActivityAt timestamp.
 * Called after every new message is persisted.
 *
 * @param {string} convId
 * @param {string} messageId
 * @returns {Promise<Document|null>}
 */
export const updateConversationLastMessage = (convId, messageId) =>
  Conversation.findByIdAndUpdate(
    convId,
    { lastMessage: messageId, lastActivityAt: new Date() },
    { returnDocument: 'after' }
  );

/**
 * Updates the conversation's display name and/or icon.
 *
 * @param {string} convId
 * @param {{ name?: string, icon?: string }} data
 * @returns {Promise<Document|null>}
 */
export const updateConversationMeta = (convId, data) =>
  Conversation.findByIdAndUpdate(convId, { $set: data }, { returnDocument: 'after' });

/**
 * Returns the populated member list for a conversation.
 *
 * @param {string} convId
 * @returns {Promise<object[]>}
 */
export const getConversationMembers = async (convId) => {
  const conv = await Conversation.findById(convId)
    .populate('members.userId', 'username email avatarUrl')
    .select('members');
  return conv ? conv.members : [];
};

/**
 * Checks whether a user is a member of a conversation.
 *
 * @param {string} convId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export const isUserMember = async (convId, userId) => {
  const count = await Conversation.countDocuments({
    _id: convId,
    'members.userId': userId,
  });
  return count > 0;
};

/**
 * Finds an existing DM conversation between exactly two users.
 * Returns null if no DM exists.
 *
 * @param {string} userId1
 * @param {string} userId2
 * @returns {Promise<Document|null>}
 */
export const findExistingDM = (userId1, userId2) =>
  Conversation.findOne({
    isGroup: false,
    'members.userId': { $all: [userId1, userId2] },
    $expr: { $eq: [{ $size: '$members' }, 2] },
  });

/**
 * Fully deletes a conversation, including all its messages, attachments from S3, and invitations.
 *
 * @param {string} convId
 * @returns {Promise<void>}
 */
export const deleteConversationFully = async (convId) => {
  // 1. Find all messages with attachments
  const messages = await Message.find({ conversationId: convId, 'attachments.0': { $exists: true } });
  
  // Extract all S3 keys from the attachment URLs
  const objectsToDelete = [];
  messages.forEach((msg) => {
    msg.attachments.forEach((att) => {
      if (att.url) {
        try {
          // e.g. https://bucket.s3.region.amazonaws.com/uploads/filename.jpg
          const urlObj = new URL(att.url);
          // pathname usually has a leading slash, so we remove it to get the raw S3 key
          let key = urlObj.pathname.substring(1); 
          // if using cloudfront or custom domain, key might be different, but for direct S3 it's the path
          objectsToDelete.push({ Key: key });
        } catch {
          // Ignore invalid URLs
        }
      }
    });
  });

  // 2. Delete files from AWS S3 in batches of 1000 (S3 limit per request)
  if (objectsToDelete.length > 0) {
    for (let i = 0; i < objectsToDelete.length; i += 1000) {
      const batch = objectsToDelete.slice(i, i + 1000);
      try {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Delete: { Objects: batch },
          })
        );
      } catch (err) {
        console.error('[S3 Delete Error]', err);
      }
    }
  }

  // 3. Delete all messages from the database
  await Message.deleteMany({ conversationId: convId });

  // 4. Delete all invitations for this conversation
  await Invitation.deleteMany({ conversationId: convId });

  // 5. Delete the conversation itself
  await Conversation.findByIdAndDelete(convId);
};
