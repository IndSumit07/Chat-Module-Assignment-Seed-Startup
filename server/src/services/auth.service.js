import User from '../models/user.model.js';

/**
 * Finds a user document by their email address.
 * Password is excluded by default — use .select('+password') explicitly when needed.
 */
export const findUserByEmail = (email) =>
  User.findOne({ email: email.toLowerCase().trim() });

/**
 * Finds a user document by their MongoDB ObjectId.
 */
export const findUserById = (id) => User.findById(id);

/**
 * Creates and persists a new user document.
 * Accepts a plain object with at minimum: { username, email, password }.
 */
export const createUser = (data) => User.create(data);

/**
 * Permanently deletes a user by their email.
 * Used to clean up unverified registrations before a fresh re-registration.
 */
export const deleteUserByEmail = (email) =>
  User.deleteOne({ email: email.toLowerCase().trim() });

/**
 * Marks a user as email-verified by setting isVerified to true.
 */
export const markUserVerified = (userId) =>
  User.findByIdAndUpdate(userId, { isVerified: true }, { returnDocument: 'after' });

/**
 * Saves a new hashed password for the given user.
 */
export const updateUserPassword = (userId, hashedPassword) =>
  User.findByIdAndUpdate(userId, { password: hashedPassword }, { returnDocument: 'after' });

/**
 * Toggles the two-factor authentication flag for a user.
 *
 * @param {string}  userId   The user's MongoDB ID
 * @param {boolean} enabled  The desired 2FA state
 */
export const toggleTwoFactor = (userId, enabled) =>
  User.findByIdAndUpdate(userId, { twoFactorEnabled: enabled }, { returnDocument: 'after' });

/**
 * Updates public profile fields (e.g. avatarUrl).
 */
export const updateProfile = (userId, data) =>
  User.findByIdAndUpdate(userId, { $set: data }, { returnDocument: 'after' });
