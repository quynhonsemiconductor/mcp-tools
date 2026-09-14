#!/usr/bin/env bun
/**
 * smoke-binary.ts — start the compiled binary and require it to serve tools.
 *
 * This exists because four releases reported success while shipping an executable
 * that could not start. v0.1.3 and v0.1.4 both exited immediately with
 *
 *   error: Cannot find module '../../package.json' from '/$bunfs/root/src/bin/mcp.js'
 *
 * caused by a top-level read of package.json that resolves under `bun run` and not
 * inside a single-file executable. Nothing in the pipeline ever executed the artifact,
 * so the build passed, the checksum passed, the upload passed, and the only thing that
 * mattered — whether it runs — was never checked.
 *
 * A type check cannot catch this, and neither can the unit suite: both run the source
 * through bun, where the failing form works. It only appears in the compiled output,
 * so the compiled output has to be started.
 *
 * Usage: bun run scripts/smoke-binary.ts <path-to-binary>
 */

import { spawn } from 'node:child_process';

const STARTUP_TIMEOUT_MS = 90_000;

interface JsonRpcMessage {
  id?: number;
  result?: { tools?: unknown[]; protocolVersion?: string; serverInfo?: { name?: string } };
  error?: { message?: string };
}

/**
 * Start the binary, complete an MCP handshake, and return the tools it offers.
 *
 * @param binary - Path to the compiled executable
 * @returns Tool count and server identity
 * @throws If the process dies, or does not answer within the timeout
 */
async function probe(binary: string): Promise<{ tools: number; server: string; protocol: string }> {
  const child = spawn(binary, ['--config', 'fromEnv'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      HOME: process.env.HOME ?? '/tmp',
      // One category is enough to prove tools reach a client, and Utility needs no
      // credentials, so this asserts nothing about the environment it runs in.
      'QNSC_MCP_CONFIG__TOOLS__INCLUDE_CATEGORIES__Utility': 'true',
    },
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));

  let exited: number | null = null;
  child.on('exit', (code) => (exited = code ?? -1));

  const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'smoke', version: '1.0' },
    },
  });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });

  const findReply = (id: number): JsonRpcMessage | undefined => {
    for (const line of stdout.split('\n')) {
      if (!line.startsWith('{')) continue;
      try {
        const parsed = JSON.parse(line) as JsonRpcMessage;
        if (parsed.id === id) return parsed;
      } catch {
        // Partial line while a write is in flight; the next poll sees it whole.
      }
    }
    return undefined;
  };

  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    // An early exit is the failure this script was written for, so report the
    // process output rather than waiting out the full timeout.
    if (exited !== null && !findReply(2)) {
      throw new Error(
        `binary exited with code ${exited} before answering\n` +
          `stderr:\n${stderr.trim() || '(empty)'}\nstdout:\n${stdout.trim() || '(empty)'}`,
      );
    }
    const list = findReply(2);
    if (list) {
      // The server ignores stdin EOF, so it has to be killed rather than closed.
      child.kill();
      if (list.error) throw new Error(`tools/list failed: ${list.error.message}`);
      const init = findReply(1);
      return {
        tools: list.result?.tools?.length ?? 0,
        server: init?.result?.serverInfo?.name ?? 'unknown',
        protocol: init?.result?.protocolVersion ?? 'unknown',
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  child.kill();
  throw new Error(
    `no tools/list response within ${STARTUP_TIMEOUT_MS}ms\n` +
      `stderr:\n${stderr.trim() || '(empty)'}\nstdout:\n${stdout.trim() || '(empty)'}`,
  );
}

const binary = process.argv[2];
if (!binary) {
  console.error('usage: bun run scripts/smoke-binary.ts <path-to-binary>');
  process.exit(2);
}

try {
  const { tools, server, protocol } = await probe(binary);
  if (tools === 0) {
    console.error(`✖ ${binary} started but offered no tools`);
    process.exit(1);
  }
  console.log(`✓ ${binary} started — ${server}, protocol ${protocol}, ${tools} tools`);
} catch (error) {
  console.error(`✖ ${binary} failed to serve tools`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
