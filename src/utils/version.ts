/**
 * version.ts — the package version, resolved without touching the filesystem.
 *
 * This exists because three call sites read the version with
 * `require('../package.json')`, and **every published binary failed to start**
 * because of it — v0.1.3 and v0.1.4 alike:
 *
 *   error: Cannot find module '../../package.json' from '/$bunfs/root/src/bin/mcp.js'
 *
 * Compiling to a single-file executable flattens every module into one entry, so a
 * path relative to the original file no longer resolves, and no package.json sits
 * beside the binary to fall back to. The `try/catch` at each call site did not help:
 * the module cannot be resolved when the bundle is built, so the failure happens as
 * the graph is evaluated rather than inside the guarded block.
 *
 * Two other approaches were tried against a locally compiled binary and both failed
 * identically, which is why this one refers to package.json in no form at all:
 *
 *   - `import pkg from '../../package.json'` — bun's `--compile` does not inline it,
 *     it emits `createRequire(import.meta.url)('../../package.json')`.
 *   - `readFileSync(new URL('../../package.json', import.meta.url))` — the bundler
 *     treats `new URL(..., import.meta.url)` as an asset reference and resolves it
 *     too, so the same string survived into the binary.
 *
 * What remains has no path, no import and no file read: a compile-time literal, with
 * an environment variable for development.
 */

// Substituted by scripts/build.ts through Bun.build's `define`, so compiled binaries
// carry the version as a literal. Undefined under `bun run` and `bun test`.
declare const __PACKAGE_VERSION__: string | undefined;

/**
 * The version of this package.
 *
 * A literal in compiled binaries. Under `bun run` it comes from the environment,
 * which bun populates from package.json when running a script — a value that is
 * already in memory rather than a file to resolve.
 */
export const PACKAGE_VERSION: string =
  (typeof __PACKAGE_VERSION__ === 'string' && __PACKAGE_VERSION__.length > 0
    ? __PACKAGE_VERSION__
    : process.env.APP_VERSION || process.env.npm_package_version) || '0.0.0';
