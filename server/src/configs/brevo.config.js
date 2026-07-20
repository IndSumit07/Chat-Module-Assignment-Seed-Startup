import { BrevoClient } from '@getbrevo/brevo';
import env from './env.config.js';

/**
 * Pre-configured Brevo client instance using the v6 SDK.
 * Exposes all Brevo API namespaces (e.g. transactionalEmails, contacts).
 */
const brevoClient = new BrevoClient({
  apiKey: env.brevo.apiKey,
});

/** Default sender identity used across all outgoing emails */
export const defaultSender = {
  email: env.brevo.senderEmail,
  name: env.brevo.senderName,
};

export default brevoClient;

