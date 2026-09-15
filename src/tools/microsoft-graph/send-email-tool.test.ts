/**
 * Tests for the recipient domain guard.
 *
 * This is the one safeguard standing between "the assistant can send mail" and "content
 * written by an outsider can cause mail to be sent to an outsider". The client normally
 * asks before a tool runs, but that disappears once a tool is allowlisted, and this has
 * to hold on its own when it does.
 */

import { describe, expect, it } from 'bun:test';
import '../../test-utils/mocks';
import { assertRecipientsAllowed } from './send-email-tool';

describe('assertRecipientsAllowed', () => {
  const allowed = ['qnsc.vn'];

  it('permits addresses inside the organisation', () => {
    expect(() => assertRecipientsAllowed(['NghiaVT@qnsc.vn', 'sinh@qnsc.vn'], allowed)).not.toThrow();
  });

  it('refuses an outside address', () => {
    expect(() => assertRecipientsAllowed(['someone@gmail.com'], allowed)).toThrow();
  });

  it('refuses when a single outside address hides among internal ones', () => {
    // The case that matters: one added recipient is easy to miss in an approval prompt
    // listing several, so the check must look at every address rather than the first.
    expect(() =>
      assertRecipientsAllowed(['a@qnsc.vn', 'exfil@attacker.example', 'b@qnsc.vn'], allowed),
    ).toThrow(/attacker\.example/);
  });

  it('is case insensitive, so a capitalised domain cannot slip past', () => {
    expect(() => assertRecipientsAllowed(['Person@QNSC.VN'], allowed)).not.toThrow();
  });

  it('refuses a lookalike domain rather than matching on a suffix', () => {
    // notqnsc.vn ends with the permitted domain as a string. Matching by suffix would
    // accept it; matching the domain exactly does not.
    expect(() => assertRecipientsAllowed(['a@notqnsc.vn'], allowed)).toThrow();
    expect(() => assertRecipientsAllowed(['a@qnsc.vn.attacker.example'], allowed)).toThrow();
  });

  it('refuses a subdomain, which is a different mail destination', () => {
    expect(() => assertRecipientsAllowed(['a@mail.qnsc.vn'], allowed)).toThrow();
  });

  it('refuses an address with no domain at all', () => {
    expect(() => assertRecipientsAllowed(['not-an-address'], allowed)).toThrow();
  });

  it('permits an additional domain when one is configured', () => {
    expect(() =>
      assertRecipientsAllowed(['partner@example.com'], ['qnsc.vn', 'example.com']),
    ).not.toThrow();
  });

  it('refuses everything when no domain resolved, rather than allowing everything', () => {
    // A failure to determine the mailbox domain must not become an open relay.
    expect(() => assertRecipientsAllowed(['a@qnsc.vn'], [])).toThrow();
  });

  it('names the offending address and the reason', () => {
    let message = '';
    try {
      assertRecipientsAllowed(['outsider@example.org'], allowed);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('outsider@example.org');
    expect(message).toContain('MICROSOFT_MAIL_ALLOWED_DOMAINS');
  });
});
