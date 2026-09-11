import { embeddedFiles } from 'bun';
import type { BunFile } from 'bun';
import fs from 'fs';
import path from 'path';
import { logDebug } from '../services/logger';

const originalReadFileSync = fs.readFileSync;
const originalExistsSync = fs.existsSync;

export const assetFileCache = new Map();

/**
 * `bun-types` declares `embeddedFiles` as `ReadonlyArray<Blob>`, but at runtime
 * Bun actually populates it with `Bun.BunFile` instances, which (unlike plain
 * `Blob`) carry a `name`. Assert to the real runtime shape here, once, so the
 * rest of this file can rely on `.name` without unsafe casts scattered around.
 * `name` is read-only on `BunFile`, so callers must NOT mutate `file.name` —
 * track any resolved/stripped name in a local variable instead.
 */
const embeddedBunFiles = embeddedFiles as unknown as readonly BunFile[];

/**
 * This script will load embedded files into a cache so that they can be accessed
 * by packages that expect to read files from the filesystem. This is necessary
 * because Bun assets (blobs) cannot be read synchronously.
 *
 * Note: Keyring native binding setup is handled in src/bin/mcp.ts before any imports
 * because @napi-rs/keyring loads its binding at module import time.
 **/
export const patchReadFileSync = async function (): Promise<void> {
  const decoder = new TextDecoder('utf-8');

  logDebug(`Embedded assets: ${embeddedBunFiles.map((f) => f.name).join(', ')}`);
  for (const file of embeddedBunFiles) {
    // Bun assets don't work right with JSON files, so we embed them with .tmp extension.
    // Bun also adds hash suffixes like encoder.json.tmp-v8wvda3y, so we need to strip both.
    // `name` is read-only on BunFile, so track the resolved name locally rather than mutating.
    let resolvedName = file.name ?? '';
    if (resolvedName.includes('.tmp')) {
      resolvedName = resolvedName.replace(/\.tmp(-[a-z0-9]+)?$/, '');
    }

    const data = await file.arrayBuffer();

    assetFileCache.set(resolvedName, decoder.decode(data));
  }
};

/**
 * When Bun packages binary files, it doesn't include assets in external packages.
 * For example, gpt-3-encoder requires a JSON file and vocabulary file that it reads
 * when it initializes. To avoid this error, packages that attempt to read files
 * need to be included as embedded files (see build target in package.json). Another
 * issue to keep in mind is bun embedded files choke on files with a .json extenison,
 * so we rename them to .json.tmp.
 *
 * This function overrides the default `fs.readFileSync` to first check if the file exists
 * in the path requested. If it does not, it checks the embedded files cache.
 * If the file is found in the embedded files, it returns the contents as a Buffer.
 * If the file is not found in either location, it throws an error.
 *
 * @param filepath The path to the file to read
 * @param options Optional encoding or options
 * @returns The file contents as a string or Buffer
 */
const bunReadFileSync = function (
  filepath: fs.PathOrFileDescriptor,
  options?: any,
): string | Buffer {
  const pathStr = filepath.toString();

  try {
    return originalReadFileSync(filepath, options);
  } catch {
    // Look for the file in embedded files
    const filename = path.basename(pathStr);
    const cachedFile = assetFileCache.get(filename);
    if (cachedFile) {
      return cachedFile;
    }

    throw new Error(
      `Embedded file ${filename} not found locally or in embedded files: ${embeddedBunFiles.map((f) => f.name).join(', ')}`,
    );
  }
};

const bunExistsSync = function (filepath: fs.PathLike): boolean {
  const pathStr = filepath.toString();

  // Check if the file exists in the original filesystem
  if (originalExistsSync(filepath)) {
    return true;
  }

  // Check if the file exists in the embedded files cache
  return assetFileCache.has(path.basename(pathStr));
};

fs.readFileSync = bunReadFileSync as typeof fs.readFileSync;
fs.existsSync = bunExistsSync;

/**
 * Patch fs.promises.readFile to fall back to the patched readFileSync
 * when the original async readFile throws (e.g. ENOENT for embedded-only files).
 *
 * Consumers MUST use fs.promises.readFile() (property access through the object)
 * rather than a direct import like `import { readFile } from 'fs/promises'`,
 * because a direct import captures the original unpatched function reference
 * at import time and will not be affected by this runtime patch.
 */
const originalReadFile = fs.promises.readFile;
fs.promises.readFile = async function (
  filepath: fs.PathLike | fs.promises.FileHandle,
  options?: any,
): Promise<string | Buffer> {
  try {
    return await originalReadFile.call(fs.promises, filepath, options);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      logDebug(`fs.promises.readFile ENOENT for "${String(filepath)}", falling back to embedded cache`);
      return bunReadFileSync(filepath as fs.PathOrFileDescriptor, options);
    }
    throw error;
  }
} as typeof fs.promises.readFile;
