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
 * Named entities Teams uses, decoded in a single pass.
 *
 * A single pass matters: decoding `&amp;` before `&lt;` turns `&amp;lt;` into `<`,
 * which is double-unescaping. One regex with a lookup table cannot reorder itself,
 * so the class of bug goes away rather than being ordered around.
 */
const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

/**
 * Reduce Teams' HTML message bodies to readable text.
 *
 * Messages are HTML even for one-line replies, and handing raw markup to a model
 * wastes context and reads badly.
 *
 * Tags are removed repeatedly until the text stops changing. A single pass is not
 * enough: `<<div>script>` leaves `<script>` behind once the inner tag is taken out,
 * so one pass can reintroduce the very thing it was removing. This text is never
 * rendered as HTML, so that is a correctness problem rather than an injection one —
 * but mangled text is still wrong.
 *
 * @param html - Message body as returned by Graph
 * @returns Plain text with tags removed and entities decoded
 */
export function htmlToText(html: string): string {
  let text = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div)>/gi, '\n');

  // Loop to a fixed point, with a bound so a pathological input cannot spin.
  for (let pass = 0; pass < 10; pass += 1) {
    const stripped = text.replace(/<[^<>]*>/g, '');
    if (stripped === text) break;
    text = stripped;
  }

  return text
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39|apos);/g, (entity) => HTML_ENTITIES[entity] ?? entity)
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

    // Graph rejects $orderby on lastUpdatedDateTime when members are expanded
    // ("QueryOptions to order by 'lastUpdatedDateTime' is not supported"), and the
    // members are what make an untitled group chat identifiable. Sorting here keeps
    // both, at the cost of ordering only within the page that was fetched.
    const response = await graphRequest<ChatsResponse>(
      `/me/chats?$top=${limit}&$expand=members`,
    );
    const chats = [...(response.value ?? [])].sort((a, b) =>
      (b.lastUpdatedDateTime ?? '').localeCompare(a.lastUpdatedDateTime ?? ''),
    );

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

/**
 * Exported under a distinct name so tests can exercise the conversion directly.
 * Both CodeQL findings against the original implementation were real, so this is
 * worth pinning rather than testing only through a live Graph call.
 */
export { htmlToText as htmlToTextForTesting };
