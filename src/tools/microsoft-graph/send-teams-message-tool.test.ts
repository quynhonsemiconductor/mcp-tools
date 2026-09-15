/**
 * Tests for Teams message targeting.
 *
 * Getting the target wrong means a message arriving in the wrong conversation, which
 * cannot be taken back quietly, so the combinations are pinned here rather than
 * discovered by posting.
 */

import { describe, expect, it } from 'bun:test';
import '../../test-utils/mocks';
import { resolveTeamsTarget } from './send-teams-message-tool';

describe('resolveTeamsTarget', () => {
  it('posts to a chat', () => {
    expect(resolveTeamsTarget({ chatId: '19:abc' })).toBe('/chats/19%3Aabc/messages');
  });

  it('posts to a channel', () => {
    expect(resolveTeamsTarget({ teamId: 'team1', channelId: '19:chan' })).toBe(
      '/teams/team1/channels/19%3Achan/messages',
    );
  });

  it('replies under a channel post', () => {
    expect(
      resolveTeamsTarget({ teamId: 'team1', channelId: '19:chan', replyToMessageId: '1700' }),
    ).toBe('/teams/team1/channels/19%3Achan/messages/1700/replies');
  });

  it('refuses a chat and a channel together, which is ambiguous', () => {
    expect(() => resolveTeamsTarget({ chatId: '19:abc', teamId: 't', channelId: 'c' })).toThrow(
      /ambiguous/i,
    );
  });

  it('refuses a reply aimed at a chat, which has no threads', () => {
    // Silently posting this to the chat instead would put an answer somewhere the
    // person did not intend.
    expect(() => resolveTeamsTarget({ chatId: '19:abc', replyToMessageId: '1700' })).toThrow(
      /no threads/i,
    );
  });

  it('refuses half a channel target', () => {
    expect(() => resolveTeamsTarget({ teamId: 'team1' })).toThrow(/both teamId and channelId/i);
    expect(() => resolveTeamsTarget({ channelId: '19:chan' })).toThrow(/both teamId and channelId/i);
  });

  it('refuses no target at all', () => {
    expect(() => resolveTeamsTarget({})).toThrow(/No target given/i);
  });

  it('encodes ids, since Teams ids contain colons and other reserved characters', () => {
    const path = resolveTeamsTarget({ teamId: 'a b', channelId: '19:x@thread.tacv2' });
    expect(path).not.toContain(' ');
    expect(path).toContain('19%3Ax%40thread.tacv2');
  });
});
