#!/usr/bin/env bun
/**
 * try-tool.ts — invoke one tool locally and print what it returns.
 *
 *   bun run scripts/try-tool.ts <tool-id> '<json-args>'
 *   bun run scripts/try-tool.ts --list [filter]
 *
 * Examples:
 *   bun run scripts/try-tool.ts get-current-time '{"timezone":"Asia/Ho_Chi_Minh"}'
 *   bun run scripts/try-tool.ts read-graph '{}'
 *   bun run scripts/try-tool.ts --remote aws-knowledge-mcp-server__aws___list_regions '{}'
 *
 * Why this exists: it skips MCP transport and the editor and calls the tool's own
 * execute() through the registry, so a failure is attributable to the tool rather than
 * to config, transport or the client. Useful when working through the inventory in
 * TOOLS.md tool by tool.
 *
 * Bundled and remote tools are registered by separate initialisers, which cost time and
 * network, so they are opt-in via --bundled / --remote.
 */
import { registry } from '../src/registry';
import { toolRegistry } from '../src/registry/tool-registry';
import { loadConfig } from '../src/config';

const argv = process.argv.slice(2);
const wantBundled = argv.includes('--bundled');
const wantRemote = argv.includes('--remote');
const listMode = argv.includes('--list');
const positional = argv.filter((a) => !a.startsWith('--'));

await registry.initialize();

if (wantBundled) {
  const { initializeBundledMCPs } = await import('../src/commands/bundled-mcp');
  await initializeBundledMCPs(registry);
}
if (wantRemote) {
  const { initializeRemoteMCPs } = await import('../src/commands/remote-mcp');
  await initializeRemoteMCPs(loadConfig(), registry);
}

if (listMode) {
  const filter = positional[0]?.toLowerCase();
  const ids = registry
    .getAllTools(true)
    .map((t) => t.id)
    .filter((id) => !filter || id.toLowerCase().includes(filter))
    .sort();
  console.log(ids.join('\n'));
  console.log(`\n${ids.length} tool(s)`);
  process.exit(0);
}

const [toolId, rawArgs] = positional;
if (!toolId) {
  console.error('usage: bun run scripts/try-tool.ts <tool-id> [json-args] [--bundled] [--remote]');
  process.exit(2);
}

let args: unknown = {};
if (rawArgs) {
  try {
    args = JSON.parse(rawArgs);
  } catch (e) {
    console.error(`args must be JSON: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }
}

const reg = toolRegistry.get(toolId);
if (!reg) {
  console.error(`no tool registered with id "${toolId}".`);
  console.error('run with --list to see ids; add --bundled / --remote if it is not native.');
  process.exit(1);
}

// Validate against the tool's own schema first, the way the MCP layer does.
// Calling execute() with raw input instead surfaces a TypeError from deep inside
// the tool for what is really a bad argument — which reads like a defect when it
// is not — and skips the defaults the schema fills in.
const parsed = reg.config.parameters.safeParse(args);
if (!parsed.success) {
  console.log(`INVALID ${toolId} — arguments rejected by the tool's own schema`);
  for (const issue of parsed.error.issues) {
    const at = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    console.log(`  ${at}: ${issue.message}`);
  }
  process.exit(2);
}

const started = Date.now();
try {
  const handler = new reg.handlerClass();
  const result = await handler.execute(parsed.data);
  const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  console.log(`PASS ${toolId} (${Date.now() - started}ms)`);
  console.log(text.length > 1500 ? `${text.slice(0, 1500)}\n… truncated` : text);
} catch (e) {
  // A thrown UserError usually means the tool worked and the input or environment was
  // wrong (missing credential, no data for this project) — worth distinguishing from a
  // genuine defect when triaging.
  const name = e instanceof Error ? e.name : 'Error';
  const message = e instanceof Error ? e.message : String(e);
  console.log(`FAIL ${toolId} (${Date.now() - started}ms) — ${name}`);
  console.log(message);
  process.exit(1);
}
