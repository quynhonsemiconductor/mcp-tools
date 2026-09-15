/**
 * send-email-tool.ts — send mail as the signed-in person.
 *
 * The client asks before running a tool, so a person normally sees the recipient and
 * the subject before anything leaves. That approval is the main safeguard and it is
 * enough for ordinary use, which is why this sends rather than drafting.
 *
 * It stops being enough the moment the tool is allowlisted or permission checks are
 * skipped, and this server also reads email, documents and Teams messages — including
 * content written by people outside the company. Text read from an inbound message can
 * carry instructions, so a send tool with no constraint is an exfiltration path.
 *
 * Hence the one restriction here: recipients must be inside the organisation unless a
 * domain is explicitly permitted by configuration. Internal mail keeps working; a
 * message aimed at an outside address is refused with the reason.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors, UserError } from '../../utils';
import { graphRequest } from './api';
import env from '../../env';

export const SendOutlookMailSchema = z.object({
  to: z
    .array(z.string().email())
    .min(1)
    .max(25)
    .describe('Recipient email addresses'),
  subject: z.string().min(1).describe('Subject line'),
  body: z.string().min(1).describe('Message body as plain text'),
  cc: z.array(z.string().email()).max(25).optional().describe('Addresses to copy'),
  replyToMessageId: z
    .string()
    .optional()
    .describe(
      'Reply to this message instead of starting a new thread, keeping it in the same conversation. Use the messageId from searchOutlookMessages.',
    ),
});

export type SendOutlookMailParams = z.input<typeof SendOutlookMailSchema>;

/**
 * Domains this tool is allowed to send to.
 *
 * The signed-in user's own domain is always allowed, since that is the ordinary case.
 * MICROSOFT_MAIL_ALLOWED_DOMAINS adds others, comma separated, for a team that genuinely
 * mails a partner or customer.
 *
 * @param ownDomain - Domain of the signed-in mailbox
 * @returns Lower-cased domains that may be addressed
 */
export function allowedRecipientDomains(ownDomain: string): string[] {
  const configured = (env.MICROSOFT_MAIL_ALLOWED_DOMAINS ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter((d) => d.length > 0);
  const own = ownDomain.toLowerCase().replace(/^@/, '');
  return own ? [own, ...configured] : configured;
}

/**
 * Reject recipients outside the permitted domains.
 *
 * @param recipients - Every address the message would reach
 * @param allowed - Domains that may be addressed
 * @throws When any recipient is outside the list
 */
export function assertRecipientsAllowed(recipients: string[], allowed: string[]): void {
  const outside = recipients.filter((address) => {
    const domain = address.split('@')[1]?.toLowerCase();
    return !domain || !allowed.includes(domain);
  });
  if (outside.length > 0) {
    throw new UserError(
      `Refusing to send to ${outside.join(', ')}: outside the organisation. ` +
        `Permitted domains are ${allowed.join(', ') || '(none resolved)'}. ` +
        'This guard exists because the same server reads email and documents written by ' +
        'outsiders, so an instruction embedded in one of those could otherwise mail ' +
        'anybody. Add a domain to MICROSOFT_MAIL_ALLOWED_DOMAINS when sending outside is ' +
        'genuinely intended.',
    );
  }
}

interface Mailbox {
  mail?: string;
  userPrincipalName?: string;
}

@Tool({
  id: 'microsoft-send-email',
  name: 'sendOutlookMail',
  description:
    'Send an email as the signed-in user, or reply to an existing message. Recipients must be inside the organisation unless other domains are permitted by configuration.',
  category: 'Microsoft 365',
  parameters: SendOutlookMailSchema,
  version: '1.0.0',
  annotations: {
    title: 'Send Outlook Mail',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
})
export class SendOutlookMailTool implements ToolHandler {
  /**
   * Send a message, or reply within an existing thread.
   *
   * @param args - Recipients, subject, body, optional cc and message to reply to
   * @returns JSON string confirming what was sent and to whom
   */
  @CatchErrors()
  async execute(args: SendOutlookMailParams): Promise<string> {
    const { to, cc, subject, body, replyToMessageId } = SendOutlookMailSchema.parse(args);

    const me = await graphRequest<Mailbox>('/me?$select=mail,userPrincipalName');
    const own = (me.mail || me.userPrincipalName || '').split('@')[1] ?? '';
    assertRecipientsAllowed([...to, ...(cc ?? [])], allowedRecipientDomains(own));

    const recipients = (addresses: string[]) =>
      addresses.map((address) => ({ emailAddress: { address } }));

    if (replyToMessageId) {
      // Graph's reply action keeps the message in its conversation and quotes the
      // original, which a fresh message with "Re:" in the subject does not do.
      await graphRequest(`/me/messages/${encodeURIComponent(replyToMessageId)}/reply`, {
        method: 'POST',
        body: JSON.stringify({
          message: { toRecipients: recipients(to), ccRecipients: recipients(cc ?? []) },
          comment: body,
        }),
      });
      return JSON.stringify(
        { sent: true, mode: 'reply', inReplyTo: replyToMessageId, to, cc: cc ?? [] },
        null,
        2,
      );
    }

    await graphRequest('/me/sendMail', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          subject,
          // Plain text: the body comes from a model, and HTML would let markup in that
          // text render as markup rather than being read as written.
          body: { contentType: 'Text', content: body },
          toRecipients: recipients(to),
          ccRecipients: recipients(cc ?? []),
        },
        saveToSentItems: true,
      }),
    });

    return JSON.stringify({ sent: true, mode: 'new', subject, to, cc: cc ?? [] }, null, 2);
  }
}
