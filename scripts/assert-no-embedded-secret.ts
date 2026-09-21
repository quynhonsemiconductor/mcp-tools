#!/usr/bin/env bun
/**
 * Fail the build if a released binary carries an OAuth client secret for a device-flow provider.
 *
 * Why this checks the artifact rather than the source: the secret reached users through a build
 * step, not through a committed value. `scripts/build.ts` injected it with `bun --define`, so the
 * repository stayed clean while every published binary carried it. A test over the source could
 * read correctly and prove nothing about what shipped.
 *
 * Why a plaintext search is not enough on its own: the secret was XOR-obfuscated against a key
 * compiled in beside it, so grepping a binary for the secret's own characters would have found
 * nothing while the secret was fully recoverable. This looks for the *shape* instead — a
 * `clientSecret` key inside a device-flow provider's entry in the embedded credential context —
 * which is present whenever a secret was embedded, obfuscated or not.
 *
 * Usage: bun run scripts/assert-no-embedded-secret.ts <path-to-binary>
 */

import { readFileSync } from 'node:fs';

/**
 * Providers that sign in with the device grant and must therefore carry no secret.
 * Mirrors DEVICE_FLOW_CLIENTS in scripts/build.ts.
 */
const DEVICE_FLOW_CLIENTS = ['github'];

const binaryPath = process.argv[2];
if (!binaryPath) {
  console.error('Usage: bun run scripts/assert-no-embedded-secret.ts <path-to-binary>');
  process.exit(1);
}

let haystack: string;
try {
  // latin1 so every byte maps to one character: the injected context is ASCII JSON, and a utf-8
  // read would mangle surrounding binary and could split the run of text being matched.
  haystack = readFileSync(binaryPath).toString('latin1');
} catch (err) {
  console.error(`✖ could not read ${binaryPath}: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

let failed = false;

// Trim long matches in the error output so a failure stays readable.
const MATCH_PREVIEW_LIMIT = 200;

for (const client of DEVICE_FLOW_CLIENTS) {
  // The bundler emits the define with unquoted keys, so both spellings are accepted.
  const pattern = new RegExp(`["']?${client}["']?\\s*:\\s*\\{([^}]*)\\}`, 'g');
  const matches = [...haystack.matchAll(pattern)];

  if (matches.length === 0) {
    console.log(`• ${client}: no embedded entry found (a build without a client id — nothing to check)`);
    continue;
  }

  const offending = matches.filter((m) => /clientSecret\s*:/.test(m[1]));
  if (offending.length > 0) {
    failed = true;
    console.error(
      `✖ ${client}: the binary carries a clientSecret. ${client} signs in with the device grant, ` +
        `which needs no secret, so this should not have been embedded.\n` +
        `  found: ${offending[0][0].slice(0, MATCH_PREVIEW_LIMIT)}`,
    );
  } else {
    console.log(`✓ ${client}: embedded entry carries a client id and no secret`);
  }
}

if (failed) {
  process.exit(1);
}
console.log('✓ no device-flow provider ships a client secret');
