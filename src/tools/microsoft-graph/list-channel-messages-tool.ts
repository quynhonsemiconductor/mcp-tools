/**
 * list-channel-messages-tool.ts — posts in the Teams channels this user has joined.
 *
 * Chats cover direct and group conversations; this covers the other half, where team
 * discussion actually happens. Channel posts are threaded, so a reply carries as much
 * as the post it answers, and replies are fetched for each post rather than left out.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors } from '../../utils';
import { graphRequest } from './api';
import { htmlToText } from './list-chats-tool';

export const ListChannelMessagesSchema = z.object({
  teamId: z
    .string()
    .optional()
    .describe('Team to list channels for. Omit to list the teams this user has joined.'),
  channelId: z
    .string()
    .optional()
    .describe('Channel to read posts from. Requires teamId.'),
  limit: z.number().int().min(1).max(50).default(20).describe('Maximum teams, channels or posts'),
  includeReplies: z
    .boolean()
    .default(true)
    .describe('Fetch replies to each post. Costs one request per post, so turn off for speed.'),
});

export type ListChannelMessagesParams = z.input<typeof ListChannelMessagesSchema>;

interface NamedResponse {
  value?: { id?: string; displayName?: string; description?: string | null }[];
}

interface ChannelMessagesResponse {
  value?: {
    id?: string;
    createdDateTime?: string;
    subject?: string | null;
    from?: { user?: { displayName?: string } };
    body?: { content?: string };
  }[];
}

@Tool({
  id: 'microsoft-list-channel-messages',
  name: 'listTeamsChannelMessages',
  description:
    'Browse Microsoft Teams channels and read their posts. Call with no arguments to list joined teams, with teamId to list its channels, then with both to read posts. Use for questions about team-wide discussion, as opposed to direct chats.',
  category: 'Microsoft 365',
  parameters: ListChannelMessagesSchema,
  version: '1.0.0',
  annotations: {
    title: 'List Teams Channel Messages',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class ListChannelMessagesTool implements ToolHandler {
  /**
   * Walk teams, then channels, then posts.
   *
   * Three levels are unavoidable: Graph has no endpoint that searches channel posts
   * across a tenant, so the ids have to be discovered a level at a time.
   *
   * @param args - Optional team and channel ids, a limit, and whether to fetch replies
   * @returns JSON string of teams, channels, or posts with their replies
   */
  @CatchErrors()
  async execute(args: ListChannelMessagesParams): Promise<string> {
    const { teamId, channelId, limit, includeReplies } = ListChannelMessagesSchema.parse(args);

    if (!teamId) {
      const response = await graphRequest<NamedResponse>(`/me/joinedTeams?$top=${limit}`);
      return JSON.stringify(
        {
          hint: 'Pass one of these teamId values back to list its channels.',
          count: response.value?.length ?? 0,
          teams: (response.value ?? []).map((team) => ({
            teamId: team.id,
            name: team.displayName,
            description: team.description || undefined,
          })),
        },
        null,
        2,
      );
    }

    if (!channelId) {
      const response = await graphRequest<NamedResponse>(
        `/teams/${encodeURIComponent(teamId)}/channels?$top=${limit}`,
      );
      return JSON.stringify(
        {
          teamId,
          hint: 'Pass teamId together with one of these channelId values to read posts.',
          count: response.value?.length ?? 0,
          channels: (response.value ?? []).map((channel) => ({
            channelId: channel.id,
            name: channel.displayName,
            description: channel.description || undefined,
          })),
        },
        null,
        2,
      );
    }

    const base = `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}`;
    const response = await graphRequest<ChannelMessagesResponse>(`${base}/messages?$top=${limit}`);
    const posts = (response.value ?? []).filter(
      (post) => (post.body?.content ?? '').trim().length > 0,
    );

    const withReplies = await Promise.all(
      posts.map(async (post) => {
        const entry = {
          messageId: post.id,
          subject: post.subject || undefined,
          posted: post.createdDateTime,
          from: post.from?.user?.displayName,
          text: htmlToText(post.body?.content ?? ''),
        };
        if (!includeReplies || !post.id) return entry;

        // A post without its replies is often the least informative part of the
        // thread — the answer is in the replies. Failing to read them should not
        // discard the post, so this degrades rather than throwing.
        try {
          const replies = await graphRequest<ChannelMessagesResponse>(
            `${base}/messages/${encodeURIComponent(post.id)}/replies?$top=20`,
          );
          const items = (replies.value ?? [])
            .filter((reply) => (reply.body?.content ?? '').trim().length > 0)
            .map((reply) => ({
              posted: reply.createdDateTime,
              from: reply.from?.user?.displayName,
              text: htmlToText(reply.body?.content ?? ''),
            }));
          return items.length > 0 ? { ...entry, replies: items } : entry;
        } catch {
          return { ...entry, repliesUnavailable: true };
        }
      }),
    );

    return JSON.stringify({ teamId, channelId, count: withReplies.length, posts: withReplies }, null, 2);
  }
}
