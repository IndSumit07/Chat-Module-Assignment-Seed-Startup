import { Worker } from 'bullmq';
import brevoClient, { defaultSender } from '../configs/brevo.config.js';
import { QUEUE_NAMES, bullmqConnection } from '../configs/queue.config.js';


/**
 * Email templates keyed by purpose.
 * Defined here (alongside the worker processor) so the worker is self-contained
 * and doesn't depend on the mail.service module.
 */
const EMAIL_TEMPLATES = {
  register: {
    subject: 'Verify your account — OTP',
    heading: 'Welcome! Confirm your email',
  },
  login: {
    subject: 'Your login verification code',
    heading: 'Two-Factor Authentication',
  },
  reset: {
    subject: 'Reset your password — OTP',
    heading: 'Password Reset Request',
  },
};

/**
 * Renders the branded HTML email body for an OTP notification.
 *
 * @param {string} heading  Template heading text
 * @param {string} otp      The 6-digit one-time code
 * @returns {string}        HTML string
 */
const buildOtpHtml = (heading, otp) => `
  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 8px;">
    <h2 style="color: #111827; margin-bottom: 8px;">${heading}</h2>
    <p style="color: #6b7280; margin-bottom: 24px;">
      Use the one-time code below to proceed. It expires in <strong>10 minutes</strong>.
    </p>
    <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
      <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #111827;">${otp}</span>
    </div>
    <p style="color: #9ca3af; font-size: 13px;">This code can only be used once. Do not share it with anyone.</p>
  </div>
`;

/**
 * Job processor — executed for every job dequeued from the email queue.
 *
 * Expected job data shape:
 * {
 *   toEmail:  string  — recipient email
 *   toName:   string  — recipient display name
 *   otp:      string  — the 6-digit code
 *   purpose:  'register' | 'login' | 'reset'
 * }
 *
 * On failure, BullMQ automatically retries up to the configured attempts limit
 * with exponential backoff — no manual retry logic needed here.
 */
const processEmailJob = async (job) => {
  const { toEmail, toName, otp, purpose } = job.data;
  const template = EMAIL_TEMPLATES[purpose];

  if (!template) {
    // Unknown purpose — throw to prevent infinite retry loops
    throw new Error(`Unknown email purpose: "${purpose}"`);
  }

  await brevoClient.transactionalEmails.sendTransacEmail({
    sender: defaultSender,
    to: [{ email: toEmail, name: toName }],
    subject: template.subject,
    htmlContent: buildOtpHtml(template.heading, otp),
  });

  console.log(`[MailWorker] Email sent — purpose: ${purpose}, to: ${toEmail}`);
};

/**
 * Mail Worker — listens on the email queue and processes one job at a time.
 *
 * concurrency: 5 — allows up to 5 simultaneous Brevo API calls.
 * Keeping it low avoids hitting Brevo's rate limits in small deployments.
 */
const mailWorker = new Worker(QUEUE_NAMES.EMAIL, processEmailJob, {
  connection: bullmqConnection,
  concurrency: 5,
});

mailWorker.on('completed', (job) => {
  console.log(`[MailWorker] Job ${job.id} completed — ${job.data.purpose} → ${job.data.toEmail}`);
});

mailWorker.on('failed', (job, err) => {
  console.error(`[MailWorker] Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
});

mailWorker.on('error', (err) => {
  console.error(`[MailWorker] Worker error: ${err.message}`);
});

export default mailWorker;
