import brevoClient, { defaultSender } from '../configs/brevo.config.js';

/**
 * OTP email templates indexed by purpose.
 * Keeping templates here makes it trivial to update copy without touching service logic.
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
 * Sends a branded OTP email to the user via Brevo's transactional email API.
 *
 * @param {string} toEmail   Recipient email address
 * @param {string} toName    Recipient display name
 * @param {string} otp       The one-time code to include in the email
 * @param {string} purpose   'register' | 'login' | 'reset'
 */
export const sendOtpEmail = async (toEmail, toName, otp, purpose) => {
  const template = EMAIL_TEMPLATES[purpose];

  await brevoClient.transactionalEmails.sendTransacEmail({
    sender: defaultSender,
    to: [{ email: toEmail, name: toName }],
    subject: template.subject,
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #111827; margin-bottom: 8px;">${template.heading}</h2>
        <p style="color: #6b7280; margin-bottom: 24px;">Use the one-time code below to proceed. It expires in <strong>10 minutes</strong>.</p>
        <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #111827;">${otp}</span>
        </div>
        <p style="color: #9ca3af; font-size: 13px;">This code can only be used once. Do not share it with anyone.</p>
      </div>
    `,
  });
};

