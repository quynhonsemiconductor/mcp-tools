/**
 * send-teams-message-tool.ts — post into a Teams chat or channel.
 *
 * Reading Teams without being able to answer is the asymmetry people notice first: the
 * discussion is visible and the reply has to happen somewhere else.
 *
 * One tool covers chats, channel posts and channel replies because they are the same
 * action against different targets, and splitting them into three would put three nearly
 * identical descriptions in front of the model on every request.
 *
 * There is no domain restriction here, unlike mail. A chat or channel is a place the
 * signed-in person is already a member of, addressed by id rather than by address, so
 * there is no equivalent of sending to an arbitrary outsider. The client's approval
 * prompt remains the check on what gets posted.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors, UserError } from '../../utils';
import { graphRequest } from './api';

export const SendTeamsMessageSchema = z
  .object({
    chatId: z
      .string()
      .optional()
      .describe('Chat to post into, from listTeamsChats. Use this or teamId with channelId.'),
    teamId: z.string().optional().describe('Team of the channel to post into, from listTeamsChannelMessages'),
    channelId: z.string().optional().describe('Channel to post into, from listTeamsChannelMessages'),
    replyToMessageId: z
      .string()
      .optional()
      .describe(
        'Reply under this channel post rather than starting a new thread. Channels only — a chat has no threads.',
      ),
    text: z.string().min(1).describe('Message text to post'),
  })
  .describe('Post into a Teams chat or channel');

export type SendTeamsMessageParams = z.input<typeof SendTeamsMessageSchema>;

/**
 * Work out which Graph path a request addresses.
 *
 * Kept separate so the combinations can be tested without posting anything: getting
 * this wrong means a message arriving in the wrong conversation, which cannot be undone
 * quietly.
 *
 * @param args - The validated request
 * @returns The path to post to
 * @throws When the target is missing, ambiguous, or a reply is aimed at a chat
 */
export function resolveTeamsTarget(args: {
  chatId?: string;
  teamId?: string;
  channelId?: string;
  replyToMessageId?: string;
}): string {
  const { chatId, teamId, channelId, replyToMessageId } = args;
  const hasChannel = Boolean(teamId && channelId);

  if (chatId && (teamId || channelId)) {
    throw new UserError(
      'Give either chatId or teamId with channelId, not both — otherwise which conversation is meant is ambiguous.',
    );
  }
  if (chatId) {
    if (replyToMessageId) {
      throw new UserError(
        'A chat has no threads, so replyToMessageId cannot apply to one. Post to the chat, or reply inside a channel.',
      );
    }
    return `/chats/${encodeURIComponent(chatId)}/messages`;
  }
  if (hasChannel) {
    const base = `/teams/${encodeURIComponent(teamId!)}/channels/${encodeURIComponent(channelId!)}/messages`;
    return replyToMessageId ? `${base}/${encodeURIComponent(replyToMessageId)}/replies` : base;
  }
  if (teamId || channelId) {
    throw new UserError('A channel needs both teamId and channelId; only one was given.');
  }
  throw new UserError('No target given: pass chatId, or teamId with channelId.');
}

@Tool({
  id: 'microsoft-send-teams-message',
  name: 'sendTeamsMessage',
  description:
    'Post a message into a Teams chat or channel, or reply under an existing channel post. Use the ids returned by listTeamsChats or listTeamsChannelMessages.',
  category: 'Microsoft 365',
  parameters: SendTeamsMessageSchema,
  version: '1.0.0',
  annotations: {
    title: 'Send Teams Message',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
})
export class SendTeamsMessageTool implements ToolHandler {
  /**
   * Post the message.
   *
   * @param args - Target ids and the text to post
   * @returns JSON string confirming where it was posted
   */
  @CatchErrors()
  async execute(args: SendTeamsMessageParams): Promise<string> {
    const parsed = SendTeamsMessageSchema.parse(args);
    const path = resolveTeamsTarget(parsed);

    const created = await graphRequest<{ id?: string; webUrl?: string }>(path, {
      method: 'POST',
      // Plain text: the content comes from a model, and as HTML any markup in it would
      // render rather than being read as written.
      body: JSON.stringify({ body: { contentType: 'text', content: parsed.text } }),
    });

    return JSON.stringify(
      {
        posted: true,
        messageId: created.id,
        target: parsed.chatId
          ? { chatId: parsed.chatId }
          : { teamId: parsed.teamId, channelId: parsed.channelId },
        ...(parsed.replyToMessageId ? { repliedTo: parsed.replyToMessageId } : {}),
        link: created.webUrl,
      },
      null,
      2,
    );
  }
}
