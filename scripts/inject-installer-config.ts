#!/usr/bin/env bun
/**
 * inject-installer-config.ts - Inject configuration into the GUI installer
 *
 * This script handles all build-time configuration for the Electron installer,
 * which cannot use Bun's native --define mechanism.
 *
 * Handles:
 * - RELEASES_TOKEN: Auth token for downloading binaries (obfuscated)
 * - ARTIFACT_SOURCE_MODE: 'release' (default) or 'artifact' for PR builds
 * - WORKFLOW_RUN_ID: GitHub Actions run ID for artifact downloads
 *
 * Usage:
 *   # Release mode (production)
 *   RELEASES_TOKEN=xxx bun scripts/inject-installer-config.ts
 *
 *   # Artifact mode (PR builds)
 *   RELEASES_TOKEN=xxx ARTIFACT_SOURCE_MODE=artifact WORKFLOW_RUN_ID=12345 \
 *     bun scripts/inject-installer-config.ts
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const INSTALLER_MAIN = path.join(rootDir, 'installer', 'src', 'main.ts');

// Placeholders in installer/src/main.ts
const KEY_PLACEHOLDER = '__OBFUSCATION_KEY_PLACEHOLDER__';
const RELEASES_TOKEN_PLACEHOLDER = '__RELEASES_TOKEN_PLACEHOLDER__';
const MODE_PLACEHOLDER = '__ARTIFACT_SOURCE_MODE_PLACEHOLDER__';
const RUN_ID_PLACEHOLDER = '__WORKFLOW_RUN_ID_PLACEHOLDER__';

const OBFUSCATION_KEY_LENGTH = 32;

/**
 * XOR-obfuscate a string with the given key
 */
function obfuscate(plaintext: string, key: Buffer): string {
  const data = Buffer.from(plaintext, 'utf-8');
  const result = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ key[i % key.length];
  }
  return result.toString('base64');
}

/**
 * Replace a placeholder in content, warn if not found
 */
function replaceOrWarn(
  content: string,
  placeholder: string,
  replacement: string,
  label: string
): string {
  if (!content.includes(placeholder)) {
    console.warn(`Warning: Placeholder not found for ${label} (${placeholder})`);
    return content;
  }
  return content.replace(placeholder, replacement);
}

async function main(): Promise<void> {
  console.log('\n🔧 Injecting installer configuration\n');

  if (!fs.existsSync(INSTALLER_MAIN)) {
    console.error(`❌ Installer main.ts not found: ${INSTALLER_MAIN}`);
    process.exit(1);
  }

  let content = fs.readFileSync(INSTALLER_MAIN, 'utf-8');

  // --- Releases Token (obfuscated) ---
  const releasesToken = process.env.RELEASES_TOKEN;
  if (releasesToken) {
    const obfuscationKey = crypto.randomBytes(OBFUSCATION_KEY_LENGTH);
    const obfuscationKeyBase64 = obfuscationKey.toString('base64');

    content = replaceOrWarn(content, KEY_PLACEHOLDER, obfuscationKeyBase64, 'obfuscation key');
    const encryptedToken = obfuscate(releasesToken, obfuscationKey);
    content = replaceOrWarn(content, RELEASES_TOKEN_PLACEHOLDER, encryptedToken, 'releases token');

    console.log('✅ Releases token: [OBFUSCATED]');
  } else {
    console.log('ℹ️  RELEASES_TOKEN not set; users will need their own GitHub token');
  }

  // --- Artifact Source Mode (plain text) ---
  const mode = process.env.ARTIFACT_SOURCE_MODE || 'release';
  const runId = process.env.WORKFLOW_RUN_ID || '';

  if (mode === 'artifact') {
    if (!runId) {
      console.error('❌ WORKFLOW_RUN_ID required when ARTIFACT_SOURCE_MODE=artifact');
      process.exit(1);
    }
    content = replaceOrWarn(content, MODE_PLACEHOLDER, mode, 'artifact source mode');
    content = replaceOrWarn(content, RUN_ID_PLACEHOLDER, runId, 'workflow run ID');

    console.log(`✅ Artifact mode: enabled (run ${runId})`);
  } else {
    console.log('ℹ️  Artifact mode: disabled (will use releases)');
  }

  fs.writeFileSync(INSTALLER_MAIN, content, 'utf-8');
  console.log(`\n📝 Updated: ${INSTALLER_MAIN}\n`);
}

main().catch((error) => {
  console.error('❌ Failed to inject configuration:', error);
  process.exit(1);
});
