import { Worker } from 'bullmq';
import brevoClient, { defaultSender } from '../configs/brevo.config.js';
import { QUEUE_NAMES, bullmqConnection } from '../configs/queue.config.js';

/**
 * Invitation Email Worker — processes conversation invitation email jobs.
 *
 * Expected job data shape:
 * {
 *   toEmail:          string  — recipient email address
 *   toName:           string  — recipient display name
 *   inviterName:      string  — name of the user who sent the invite
 *   inviterAvatar:    string  — inviter's avatar URL (empty string if none)
 *   conversationName: string  — name of the conversation
 *   conversationIcon: string  — icon name or URL
 *   message:          string  — optional personal message from inviter
 *   acceptUrl:        string  — deep link to accept the invitation
 *   rejectUrl:        string  — deep link to reject the invitation
 * }
 */

/**
 * Renders a professional, responsive HTML invitation email.
 * Matches the application branding (black and white, Inter font).
 */
const buildInvitationHtml = ({
  toName,
  inviterName,
  inviterAvatar,
  conversationName,
  conversationIcon,
  message,
  acceptUrl,
  rejectUrl,
}) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You've been invited</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#000000;padding:28px 32px;text-align:center;">
              <div style="width:44px;height:44px;background:rgba(255,255,255,0.15);border-radius:10px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
                <span style="font-size:22px;">${conversationIcon && !conversationIcon.startsWith('http') ? '💬' : ''}</span>
                ${conversationIcon && conversationIcon.startsWith('http') ? `<img src="${conversationIcon}" width="28" height="28" alt="icon" style="border-radius:6px;" />` : ''}
              </div>
              <p style="color:#ffffff;font-size:13px;font-weight:500;margin:0;letter-spacing:0.05em;text-transform:uppercase;">Chat Service</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px;">

              <!-- Inviter info -->
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
                ${inviterAvatar
                  ? `<img src="${inviterAvatar}" width="40" height="40" alt="${inviterName}" style="border-radius:10px;border:1px solid #e5e7eb;" />`
                  : `<div style="width:40px;height:40px;background:#000;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:16px;">${inviterName.charAt(0).toUpperCase()}</div>`
                }
                <div>
                  <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">${inviterName}</p>
                  <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">invited you to a conversation</p>
                </div>
              </div>

              <!-- Heading -->
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">
                Join <span style="color:#000;">${conversationName}</span>
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
                Hi ${toName}, you've been invited to join a conversation on Chat Service.
              </p>

              <!-- Personal message -->
              ${message ? `
              <div style="background:#f3f4f6;border-left:3px solid #000;border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:28px;">
                <p style="margin:0;font-size:13px;color:#374151;font-style:italic;line-height:1.6;">"${message}"</p>
              </div>
              ` : ''}

              <!-- CTAs -->
              <div style="display:flex;gap:12px;margin-bottom:28px;">
                <a href="${acceptUrl}" style="flex:1;display:inline-block;background:#000000;color:#ffffff;text-decoration:none;text-align:center;padding:13px 20px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.01em;">
                  Accept Invitation
                </a>
                <a href="${rejectUrl}" style="flex:1;display:inline-block;background:#ffffff;color:#374151;text-decoration:none;text-align:center;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:500;border:1px solid #d1d5db;">
                  Decline
                </a>
              </div>

              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
                This invitation expires in 7 days. If you did not expect this email, you can safely ignore it.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                Chat Service &bull; You are receiving this because someone invited you.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const processInvitationEmailJob = async (job) => {
  const data = job.data;

  await brevoClient.transactionalEmails.sendTransacEmail({
    sender: defaultSender,
    to: [{ email: data.toEmail, name: data.toName }],
    subject: `${data.inviterName} invited you to join ${data.conversationName}`,
    htmlContent: buildInvitationHtml(data),
  });

  console.log(
    `[InvitationWorker] Email sent to ${data.toEmail} for conversation "${data.conversationName}"`
  );
};

const invitationWorker = new Worker(
  QUEUE_NAMES.INVITATION_EMAIL,
  processInvitationEmailJob,
  {
    connection: bullmqConnection,
    concurrency: 5,
  }
);

invitationWorker.on('completed', (job) => {
  console.log(`[InvitationWorker] Job ${job.id} completed → ${job.data.toEmail}`);
});

invitationWorker.on('failed', (job, err) => {
  console.error(
    `[InvitationWorker] Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`
  );
});

invitationWorker.on('error', (err) => {
  console.error(`[InvitationWorker] Worker error: ${err.message}`);
});

export default invitationWorker;
