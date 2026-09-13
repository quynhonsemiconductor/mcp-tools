/**
 * search-email-tool.ts — find messages in the signed-in user's mailbox.
 *
 * The common case is remembering that something was agreed by email without
 * remembering who sent it or when. Graph's `$search` covers subject, body and
 * participants, scoped to that person's own mailbox.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors } from '../../utils';
import { graphRequest } from './api';

export const SearchOutlookMessagesSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Text to look for in the subject, body or participants, e.g. "invoice deadline"'),
  limit: z.number().int().min(1).max(50).default(10).describe('Maximum messages to return'),
  includeBody: z
    .boolean()
    .default(false)
    .describe('Include a plain-text body preview of each message rather than just the subject'),
});

export type SearchOutlookMessagesParams = z.input<typeof SearchOutlookMessagesSchema>;

interface MessagesResponse {
  value?: {
    id?: string;
    subject?: string;
    bodyPreview?: string;
    receivedDateTime?: string;
    webLink?: string;
    hasAttachments?: boolean;
    from?: { emailAddress?: { name?: string; address?: string } };
    toRecipients?: { emailAddress?: { name?: string; address?: string } }[];
  }[];
}

@Tool({
  id: 'microsoft-search-email',
  name: 'searchOutlookMessages',
  description:
    'Search the signed-in user Outlook mailbox by subject, body or participant. Use when asked what was agreed or said over email without knowing the sender or date. Returns subjects, participants, dates and links.',
  category: 'Microsoft 365',
  parameters: SearchOutlookMessagesSchema,
  version: '1.0.0',
  annotations: {
    title: 'Search Outlook Messages',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class SearchOutlookMessagesTool implements ToolHandler {
  /**
   * Search the mailbox.
   *
   * @param args - Query text, result limit, and whether to include body previews
   * @returns JSON string of matching messages
   */
  @CatchErrors()
  async execute(args: SearchOutlookMessagesParams): Promise<string> {
    const { query, limit, includeBody } = SearchOutlookMessagesSchema.parse(args);

    // Graph requires the search term in double quotes, and $orderby cannot be
    // combined with $search on messages — results come back by relevance.
    const escaped = query.replace(/"/g, '');
    const select = 'id,subject,bodyPreview,receivedDateTime,webLink,hasAttachments,from,toRecipients';
    const path =
      `/me/messages?$search=${encodeURIComponent(`"${escaped}"`)}` + `&$top=${limit}&$select=${select}`;

    const response = await graphRequest<MessagesResponse>(path);
    const messages = response.value ?? [];

    return JSON.stringify(
      {
        query,
        count: messages.length,
        results: messages.map((message) => ({
          messageId: message.id,
          subject: message.subject,
          from: message.from?.emailAddress?.address,
          fromName: message.from?.emailAddress?.name,
          to: (message.toRecipients ?? [])
            .map((recipient) => recipient.emailAddress?.address)
            .filter(Boolean),
          received: message.receivedDateTime,
          hasAttachments: message.hasAttachments,
          link: message.webLink,
          ...(includeBody ? { preview: message.bodyPreview } : {}),
        })),
      },
      null,
      2,
    );
  }
}
