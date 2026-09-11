/**
 * bun-assets.test.ts - Tests for the Bun embedded file patching system
 *
 * Reproduces the exact ENOENT error from production:
 *   ENOENT: no such file or directory, open 'mcps.tar'
 *
 * WHY THIS IS A STANDALONE SCRIPT (bun run, not bun test):
 * The test framework preloads mocks.ts which replaces all fs functions with
 * no-op mocks. This neutralises the bun-assets.ts patches — readFileSync
 * becomes mock(() => '') which never throws, so the ENOENT fallback path
 * is never exercised. Running standalone with `bun run` gives us the REAL
 * fs module so we can prove the actual ENOENT and the actual fix.
 *
 * Run: bun run src/utils/bun-assets.test.ts
 *
 * The test captures fs.promises.readFile BEFORE importing bun-assets.ts.
 * This simulates what a compiled Bun binary does when code uses:
 *   import { readFile } from 'fs/promises'
 * — the static import captures the original unpatched reference at bundle time,
 * which is NOT affected by the runtime patch in bun-assets.ts.
 */
import fs from 'fs';

// ---- Capture the original BEFORE bun-assets patches it ----
// This simulates what compiled binary static imports do.
const unpatchedReadFile = fs.promises.readFile;

// ---- Now import bun-assets, which patches fs at module scope ----
const { assetFileCache } = await import('./bun-assets');

// ---- Test setup ----
const FILE = 'mcps-test-embedded-only.tar';
const CONTENT = 'fake-tar-binary-content-for-testing';
assetFileCache.set(FILE, CONTENT);

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string): void {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

console.log('\nbun-assets ENOENT fix\n');

// Verify the patch actually replaced the function
assert(
  unpatchedReadFile !== fs.promises.readFile,
  'bun-assets.ts patches fs.promises.readFile (different function reference)',
);

// 1. Unpatched reference (simulating compiled static import) → ENOENT
try {
  await unpatchedReadFile(FILE);
  assert(false, 'unpatched readFile throws ENOENT for embedded-only files', 'did not throw');
} catch (error: any) {
  assert(
    error.code === 'ENOENT' && error.syscall === 'open' && error.path === FILE,
    'unpatched readFile throws ENOENT for embedded-only files',
  );
}

// 2. Patched property access (what mcp-extractor.ts uses) → resolves from cache
try {
  const content = await fs.promises.readFile(FILE);
  assert(
    content.toString().includes(CONTENT),
    'patched fs.promises.readFile resolves embedded-only files (no ENOENT)',
  );
} catch (error: any) {
  assert(
    false,
    'patched fs.promises.readFile resolves embedded-only files (no ENOENT)',
    error.code,
  );
}

// 3. Patched readFileSync → resolves from cache
try {
  const content = fs.readFileSync(FILE);
  assert(
    content.toString().includes(CONTENT),
    'patched fs.readFileSync resolves embedded-only files',
  );
} catch (error: any) {
  assert(false, 'patched fs.readFileSync resolves embedded-only files', error.message);
}

// 4. Patched existsSync → true for cached files
assert(
  fs.existsSync(FILE) === true,
  'patched fs.existsSync reports embedded-only files as existing',
);

// 5. Files not on disk AND not in cache still throw
try {
  await fs.promises.readFile('truly-does-not-exist-anywhere.xyz');
  assert(false, 'files not on disk and not in cache still throw', 'did not throw');
} catch {
  assert(true, 'files not on disk and not in cache still throw');
}

// 6. Non-ENOENT errors (e.g. EISDIR) are re-thrown, not swallowed
try {
  // Reading a directory triggers EISDIR, which must NOT be caught by the patch
  await fs.promises.readFile('.');
  assert(false, 'non-ENOENT errors are re-thrown (not swallowed)', 'did not throw');
} catch (error: any) {
  assert(error.code !== 'ENOENT', 'non-ENOENT errors are re-thrown (not swallowed)');
}

// ---- Summary ----
assetFileCache.delete(FILE);
console.log(`\n${passed} pass, ${failed} fail\n`);
process.exit(failed > 0 ? 1 : 0);
