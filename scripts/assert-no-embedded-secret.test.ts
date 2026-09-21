/**
 * Tests for the embedded-secret guard, and specifically for its redaction.
 *
 * The redaction exists because the guard used to print the matched text on failure, and the match
 * contains the `clientSecret` value — so the check that stops a secret shipping pasted it into CI logs
 * at the moment it fired.
 *
 * It needs a test more than most code does, because a regression is silent IN THE LEAKING DIRECTION. If
 * the pattern stops matching, the script still finds the secret, still exits 1, and still looks like it
 * worked — while printing the value it was added to hide. Nothing fails. That is the shape this file
 * exists to catch, and it is why the assertions check what is ABSENT from the output as well as what is
 * present.
 *
 * Run as a subprocess against a fixture rather than by importing the module: the script reads
 * `process.argv[2]` and calls `process.exit`, so the exit status and stderr are the contract a caller
 * actually depends on.
 */

import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';

const SCRIPT = 'scripts/assert-no-embedded-secret.ts';

/**
 * A fake binary: the guard scans bytes, so a file containing the shape is enough.
 *
 * Written with `Bun.write` rather than `node:fs`, and the path is built by hand rather than with
 * `mkdtempSync`. This repository preloads `src/test-utils/mocks.ts`, which mocks BOTH `node:os.tmpdir`
 * and `node:fs.mkdtempSync` — the latter returns the literal `/mock-tmp-dir` whatever it is given, so
 * every fixture was written nowhere and all five cases failed with ENOENT while the code under test was
 * correct. Bun's own API is untouched by that preload.
 */
async function fixture(contents: string): Promise<string> {
  const path = `/tmp/assert-secret-${Date.now()}-${Math.random().toString(36).slice(2)}/fake-binary`;
  await Bun.write(path, contents);
  return path;
}

function run(path: string) {
  const res = spawnSync('bun', ['run', SCRIPT, path], { encoding: 'utf-8' });
  return { status: res.status, out: `${res.stdout}${res.stderr}` };
}

describe('assert-no-embedded-secret', () => {
  /** The value must not appear, which is the whole point of the redaction. */
  it('never prints the clientSecret value it found', async () => {
    const secret = 'c2VjcmV0LXZhbHVlLXRoYXQtbXVzdC1ub3QtYXBwZWFy';
    const { status, out } = run(await fixture(`github:{clientId:"YWJj",clientSecret:"${secret}"}`));

    expect(status).toBe(1);
    expect(out).not.toContain(secret);
    expect(out).toContain('<redacted>');
  });

  /**
   * The failure still has to be diagnosable. Redacting everything would satisfy the test above and
   * leave a reader unable to tell which provider or which key was at fault.
   */
  it('keeps the provider, the key name and the public clientId visible', async () => {
    const { out } = run(await fixture('github:{clientId:"YWJj",clientSecret:"shhh"}'));

    expect(out).toContain('github');
    expect(out).toContain('clientSecret');
    expect(out).toContain('YWJj');
  });

  /**
   * The bundler emits the injected context with unquoted keys and values, so an unquoted secret is the
   * form that actually ships. The reviewer that prompted this test named the quoted/unquoted asymmetry
   * as the thing a test would catch.
   */
  it('redacts an unquoted value too, which is the form the bundler emits', async () => {
    const { status, out } = run(await fixture('github:{clientId:YWJj,clientSecret:bare-secret-value}'));

    expect(status).toBe(1);
    expect(out).not.toContain('bare-secret-value');
    expect(out).toContain('<redacted>');
  });

  it('passes a binary that carries a client id and no secret', async () => {
    const { status, out } = run(await fixture('github:{clientId:"YWJj"}'));

    expect(status).toBe(0);
    expect(out).toContain('no secret');
  });

  /**
   * A build with no client id embeds nothing, which is a pull request rather than a release. It must not
   * be reported as a violation — the guard is about a secret being present, not an id being absent.
   */
  it('reports nothing to check when no entry was embedded', async () => {
    const { status } = run(await fixture('no embedded credential context here'));

    expect(status).toBe(0);
  });
});
