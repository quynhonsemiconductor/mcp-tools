/**
 * list-chats-tool.ts — the signed-in user's Teams conversations and their messages.
 *
 * Teams is where decisions actually get made, and they are hard to find later: the
 * thread has no title and nobody remembers the date. This lists conversations, and
 * optionally the recent messages in one of them.
 *
 * Graph has no `$search` on chat messages, so this deliberately lists rather than
 * pretending to search — a fake search that silently matched nothing would be worse
 * than an honest list.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors } from '../../utils';
import { graphRequest } from './api';

export const ListTeamsChatsSchema = z.object({
  chatId: z
    .string()
    .optional()
    .describe('Read recent messages from this conversation. Omit to list conversations instead.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe('Maximum conversations, or messages when chatId is given'),
});

export type ListTeamsChatsParams = z.input<typeof ListTeamsChatsSchema>;

interface ChatsResponse {
  value?: {
    id?: string;
    topic?: string | null;
    chatType?: string;
    lastUpdatedDateTime?: string;
    members?: { displayName?: string }[];
  }[];
}

interface ChatMessagesResponse {
  value?: {
    id?: string;
    createdDateTime?: string;
    from?: { user?: { displayName?: string } };
    body?: { content?: string; contentType?: string };
  }[];
}

/**
 * Reduce Teams' HTML message bodies to readable text.
 *
 * Messages are usually HTML even for one-line replies, and handing raw markup to a
 * model wastes context and reads badly.
 *
 * @param html - Message body as returned by Graph
 * @returns Plain text with tags and entities resolved
 */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

@Tool({
  id: 'microsoft-list-chats',
  name: 'listTeamsChats',
  description:
    'List the signed-in user Teams conversations, or read recent messages from one by passing chatId. Use when asked what was discussed or decided in Teams. Graph cannot search chat message text, so find the conversation first, then read it.',
  category: 'Microsoft 365',
  parameters: ListTeamsChatsSchema,
  version: '1.0.0',
  annotations: {
    title: 'List Teams Chats',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class ListTeamsChatsTool implements ToolHandler {
  /**
   * List conversations, or read one of them.
   *
   * @param args - Optional chat id, and a result limit
   * @returns JSON string of conversations or messages
   */
  @CatchErrors()
  async execute(args: ListTeamsChatsParams): Promise<string> {
    const { chatId, limit } = ListTeamsChatsSchema.parse(args);

    if (chatId) {
      const response = await graphRequest<ChatMessagesResponse>(
        `/me/chats/${encodeURIComponent(chatId)}/messages?$top=${limit}`,
      );
      const messages = (response.value ?? [])
        // Teams emits system entries for joins, renames and calls; they are noise.
        .filter((message) => (message.body?.content ?? '').trim().length > 0);

      return JSON.stringify(
        {
          chatId,
          count: messages.length,
          messages: messages.map((message) => ({
            sent: message.createdDateTime,
            from: message.from?.user?.displayName,
            text: htmlToText(message.body?.content ?? ''),
          })),
        },
        null,
        2,
      );
    }

    const response = await graphRequest<ChatsResponse>(
      `/me/chats?$top=${limit}&$expand=members&$orderby=lastUpdatedDateTime desc`,
    );
    const chats = response.value ?? [];

    return JSON.stringify(
      {
        count: chats.length,
        chats: chats.map((chat) => ({
          // Pass this back as chatId to read the conversation.
          chatId: chat.id,
          // Group chats often have no topic, so the members are the only usable label.
          topic: chat.topic ?? null,
          kind: chat.chatType,
          participants: (chat.members ?? []).map((member) => member.displayName).filter(Boolean),
          lastUpdated: chat.lastUpdatedDateTime,
        })),
      },
      null,
      2,
    );
  }
}
