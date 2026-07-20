import emailQueue from '../configs/queue.config.js';

/**
 * Queues an OTP email as a background job.
 *
 * Instead of calling Brevo synchronously (which blocks the request and fails
 * the whole flow if Brevo is slow), we push a job onto the Redis-backed email
 * queue. The mail.worker picks it up immediately and handles delivery with
 * automatic retries on failure.
 *
 * @param {string} toEmail   Recipient email address
 * @param {string} toName    Recipient display name
 * @param {string} otp       The 6-digit one-time code
 * @param {string} purpose   'register' | 'login' | 'reset'
 * @returns {Promise<Job>}   The BullMQ job object (rarely needed by callers)
 */
export const sendOtpEmail = async (toEmail, toName, otp, purpose) => {
  const job = await emailQueue.add(
    // Job name — used for filtering and logging in queue dashboards
    `otp:${purpose}`,
    { toEmail, toName, otp, purpose },
  );

  console.log(`[MailService] Queued email job ${job.id} — purpose: ${purpose}, to: ${toEmail}`);
  return job;
};
