#!/usr/bin/env node

// CRITICAL: Setup keyring native binding BEFORE any imports that might use it
// The @napi-rs/keyring module loads its native binding at import time (top-level),
// so we must set NAPI_RS_NATIVE_LIBRARY_PATH before any module that uses keyring is imported.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { embeddedFiles } from 'bun';

async function setupKeyringBinding() {
  if (process.env.NAPI_RS_NATIVE_LIBRARY_PATH) return;

  const platform = process.platform;
  const arch = process.arch;
  let bindingFilename: string | null = null;

  if (platform === 'darwin') {
    bindingFilename = arch === 'arm64' ? 'keyring.darwin-arm64.node' : 'keyring.darwin-x64.node';
  } else if (platform === 'linux') {
    bindingFilename =
      arch === 'x64' ? 'keyring.linux-x64-gnu.node' : 'keyring.linux-arm64-gnu.node';
  } else if (platform === 'win32' && arch === 'x64') {
    bindingFilename = 'keyring.win32-x64-msvc.node';
  }

  if (!bindingFilename) return;

  // First check if the binding exists on disk next to the executable
  const diskPath = path.join(path.dirname(process.execPath), bindingFilename);
  if (fs.existsSync(diskPath)) {
    process.env.NAPI_RS_NATIVE_LIBRARY_PATH = diskPath;
    return;
  }

  // If not on disk, extract from embedded files
  // Native .node files MUST be on disk to be loaded via dlopen()
  const embeddedFile = embeddedFiles.find((f: any) => f.name === bindingFilename);
  if (embeddedFile) {
    try {
      // Extract to temp directory with a stable name so we don't leak files
      const tempDir = path.join(os.tmpdir(), 'qnsc-mcp-keyring');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const extractedPath = path.join(tempDir, bindingFilename);

      // Only extract if not already present
      if (!fs.existsSync(extractedPath)) {
        const buffer = await (embeddedFile as any).arrayBuffer();
        fs.writeFileSync(extractedPath, new Uint8Array(buffer));
      }

      process.env.NAPI_RS_NATIVE_LIBRARY_PATH = extractedPath;
    } catch (error) {
      // Silently fail - keyring will fall back to its own resolution
      console.warn(`Failed to extract keyring binding: ${error}`);
    }
  }
}

await setupKeyringBinding();

// Enable OS trust store for TLS before any TLS-using import. See setup-trust.ts.
import { setupTrustStore } from '../services/tls/setup-trust.js';
setupTrustStore();

import { displayError } from '../lib/display.js';
import { main } from '../mcp.js';

// Ensure that the Bun assets are loaded before running the main function
import { patchReadFileSync } from '../utils/bun-assets.js';

void (async function () {
  await patchReadFileSync();

  main().catch((error) => {
    displayError('Error starting CLI', error);
    process.exit(1);
  });
})();
