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

interface ChannelMessageFrom {
  // A post can come from a person, an app, or Teams itself, and only one of these
  // is ever populated. Reading just `user` labelled real posts "unknown".
  user?: { displayName?: string } | null;
  application?: { displayName?: string } | null;
}

interface ChannelMessagesResponse {
  value?: {
    id?: string;
    createdDateTime?: string;
    subject?: string | null;
    from?: ChannelMessageFrom | null;
    body?: { content?: string };
  }[];
}

/**
 * Name whoever sent a post.
 *
 * @param from - The message's from field, which may name a user or an app
 * @returns A display name, or undefined when Teams itself generated the post
 */
function senderName(from?: ChannelMessageFrom | null): string | undefined {
  return from?.user?.displayName ?? from?.application?.displayName ?? undefined;
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
      // No $top: joinedTeams rejects it outright with "Query option 'Top' is not
      // allowed", as does the channels list below. Both return a membership-sized
      // collection, so limiting here costs nothing.
      const response = await graphRequest<NamedResponse>('/me/joinedTeams');
      const teams = (response.value ?? []).slice(0, limit);
      return JSON.stringify(
        {
          hint: 'Pass one of these teamId values back to list its channels.',
          count: teams.length,
          teams: teams.map((team) => ({
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
        `/teams/${encodeURIComponent(teamId)}/channels`,
      );
      const channels = (response.value ?? []).slice(0, limit);
      return JSON.stringify(
        {
          teamId,
          hint: 'Pass teamId together with one of these channelId values to read posts.',
          count: channels.length,
          channels: channels.map((channel) => ({
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
    // Filter on the converted text, not the raw body. Teams records joins, renames
    // and reactions as posts whose body is markup with no words in it, so testing the
    // HTML let those through as entries with an empty text and no sender.
    const posts = (response.value ?? [])
      .map((post) => ({ post, text: htmlToText(post.body?.content ?? '') }))
      .filter(({ text }) => text.length > 0);

    const withReplies = await Promise.all(
      posts.map(async ({ post, text }) => {
        const entry = {
          messageId: post.id,
          subject: post.subject || undefined,
          posted: post.createdDateTime,
          from: senderName(post.from),
          text,
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
            .map((reply) => ({
              posted: reply.createdDateTime,
              from: senderName(reply.from),
              text: htmlToText(reply.body?.content ?? ''),
            }))
            .filter((reply) => reply.text.length > 0);
          return items.length > 0 ? { ...entry, replies: items } : entry;
        } catch {
          return { ...entry, repliesUnavailable: true };
        }
      }),
    );

    return JSON.stringify({ teamId, channelId, count: withReplies.length, posts: withReplies }, null, 2);
  }
}
