/**
 * Setup Documentation Resolver
 *
 * Provides utilities for resolving and retrieving setup documentation (SETUP.md files)
 * for tools across different locations (native tools, bundled MCPs, remote MCPs).
 *
 * In production builds, setup documentation is embedded in the binary.
 * In development, documentation is read from the file system.
 */

import fs from 'fs';
import { logError } from '../services/logger';
import path from 'path';

// In test environment, the fs module may be mocked. The mock exposes the real
// (unmocked) fs module under a `realFs` property so callers can bypass the mock
// when actual file system access is required.
const fsToUse: typeof fs = (fs as typeof fs & { realFs?: typeof fs }).realFs ?? fs;

// Import embedded docs for production (will be generated during build)
let embeddedDocs: typeof import('../generated/setup-docs') | null = null;
try {
  embeddedDocs = await import('../generated/setup-docs');
} catch {
  // Embedded docs not available - running in development mode
  embeddedDocs = null;
}

/**
 * Check if we're running in production mode
 *
 * This ensures compiled binaries with embedded docs use production mode,
 * while dev servers with environment=development always use file system.
 *
 * Note: NODE_ENV is ignored because it's often set to 'development' by tools like Bun,
 * even in compiled binaries. Only the explicit 'environment' variable can force dev mode.
 */
function isProductionMode(): boolean {
  // Only the explicit 'environment' variable can force development mode
  // NODE_ENV is ignored because it's unreliable in compiled binaries
  const explicitEnv = process.env.environment;

  // Only respect explicit environment=development, not NODE_ENV
  if (explicitEnv === 'development') {
    return false;
  }

  // For production builds (compiled binaries), embedded docs should be available
  return embeddedDocs !== null;
}

/**
 * Get the root directory of the project
 * Works in both development and production environments
 */
function getRootDirectory(): string {
  // In Bun, we can use import.meta.url to get the current file's directory
  // Then navigate up to the project root
  if (typeof import.meta.url !== 'undefined') {
    let currentFilePath = new URL(import.meta.url).pathname;
    // On Windows, pathname starts with / which needs to be removed (e.g., /C:/path -> C:/path)
    if (process.platform === 'win32' && currentFilePath.startsWith('/')) {
      currentFilePath = currentFilePath.substring(1);
    }
    const currentDir = path.dirname(currentFilePath);
    // From src/utils, go up two levels to reach project root
    return path.join(currentDir, '../..');
  }

  // Fallback to process.cwd() if import.meta.url is not available
  return process.cwd();
}

/**
 * Result of a setup content retrieval operation
 */
export interface SetupContentResult {
  /** Whether setup documentation exists for this tool */
  exists: boolean;
  /** The markdown content of the setup documentation */
  content: string;
  /** The file path where the documentation was found (for debugging) */
  filePath?: string;
  /** The source type where documentation was found */
  source?: 'native' | 'bundled' | 'remote' | 'local';
}

/**
 * Resolve the file path to a tool's SETUP.md file
 *
 * Searches in the specified source location:
 * - Native tools: src/tools/{toolId}/SETUP.md
 * - Bundled MCPs: bundled/{toolId}/SETUP.md
 * - Remote MCPs: src/remote-mcps/SETUP_{toolId}.md
 * - Local MCPs: src/remote-mcps/SETUP_{toolId}.md
 *
 * @param toolId The tool identifier (e.g., "github", "confluence", "newrelic")
 * @param sourceType Source type to search in ('native', 'bundled', 'remote', or 'local')
 * @returns The resolved file path if found, null otherwise
 */
export function resolveSetupPath(
  toolId: string,
  sourceType: 'native' | 'bundled' | 'remote' | 'local',
): { path: string; source: 'native' | 'bundled' | 'remote' | 'local' } | null {
  // Normalize tool ID (lowercase, replace spaces/underscores with hyphens)
  const normalizedId = toolId.toLowerCase().replace(/[\s_]/g, '-');

  // Get root directory
  const rootDir = getRootDirectory();

  // Check the specified location based on sourceType
  if (sourceType === 'native') {
    const nativePath = path.join(rootDir, 'src/tools', normalizedId, 'SETUP.md');
    if (fsToUse.existsSync(nativePath)) {
      return { path: nativePath, source: 'native' };
    }
    return null;
  }

  if (sourceType === 'bundled') {
    const bundledPath = path.join(rootDir, 'bundled', normalizedId, 'SETUP.md');
    if (fsToUse.existsSync(bundledPath)) {
      return { path: bundledPath, source: 'bundled' };
    }
    return null;
  }

  if (sourceType === 'remote') {
    const remotePath = path.join(rootDir, 'src/remote-mcps', `SETUP_${normalizedId}.md`);
    if (fsToUse.existsSync(remotePath)) {
      return { path: remotePath, source: 'remote' };
    }
    return null;
  }

  if (sourceType === 'local') {
    const localPath = path.join(rootDir, 'src/local-mcps', `SETUP_${normalizedId}.md`);
    if (fsToUse.existsSync(localPath)) {
      return { path: localPath, source: 'local' };
    }
    return null;
  }

  // Should never reach here due to TypeScript type checking
  return null;
}

/**
 * Get setup documentation content for a tool
 *
 * In development mode, reads from file system directly.
 * In production mode, uses embedded documentation.
 *
 * @param toolId The tool identifier
 * @param sourceType Source type to search in ('native', 'bundled', 'remote', or 'local')
 * @returns Result containing exists flag, content, and metadata
 */
export function getSetupContent(
  toolId: string,
  sourceType: 'native' | 'bundled' | 'remote' | 'local',
): SetupContentResult {
  // In production mode, use embedded docs
  if (isProductionMode() && embeddedDocs) {
    const doc = embeddedDocs.getEmbeddedSetupDoc(toolId, sourceType);
    if (doc) {
      return {
        exists: true,
        content: doc.content,
        source: doc.source,
        filePath: `embedded:${toolId}:${sourceType}`,
      };
    }
    return {
      exists: false,
      content: '',
    };
  }

  // In development mode, read from file system
  const resolved = resolveSetupPath(toolId, sourceType);

  if (!resolved) {
    return {
      exists: false,
      content: '',
    };
  }

  try {
    const content = fsToUse.readFileSync(resolved.path, 'utf-8');

    return {
      exists: true,
      content,
      filePath: resolved.path,
      source: resolved.source,
    };
  } catch (error) {
    // File exists but couldn't be read
    logError(`Error reading setup file for ${toolId}`, { error });

    return {
      exists: false,
      content: '',
      filePath: resolved.path,
    };
  }
}

/**
 * Get all available setup documentation files
 *
 * In production mode, returns list from embedded docs.
 * In development mode, scans all four locations.
 *
 * @returns Array of tool IDs that have SETUP.md files
 */
export function getAllAvailableSetupDocs(): Array<{
  toolId: string;
  source: 'native' | 'bundled' | 'remote' | 'local';
}> {
  // In production mode, use embedded docs
  if (isProductionMode() && embeddedDocs) {
    return embeddedDocs.getAllEmbeddedSetupDocs().map((doc) => ({
      toolId: doc.toolId,
      source: doc.source,
    }));
  }

  // In development mode, scan file system
  const available: Array<{ toolId: string; source: 'native' | 'bundled' | 'remote' | 'local' }> =
    [];

  // Get root directory
  const rootDir = getRootDirectory();

  // Scan native tools
  const nativeToolsDir = path.join(rootDir, 'src/tools');
  if (fsToUse.existsSync(nativeToolsDir)) {
    const dirs = fsToUse.readdirSync(nativeToolsDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (dir.isDirectory()) {
        const setupPath = path.join(nativeToolsDir, dir.name, 'SETUP.md');
        if (fsToUse.existsSync(setupPath)) {
          available.push({ toolId: dir.name, source: 'native' });
        }
      }
    }
  }

  // Scan bundled MCPs
  const bundledDir = path.join(rootDir, 'bundled');
  if (fsToUse.existsSync(bundledDir)) {
    const dirs = fsToUse.readdirSync(bundledDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (dir.isDirectory()) {
        const setupPath = path.join(bundledDir, dir.name, 'SETUP.md');
        if (fsToUse.existsSync(setupPath)) {
          available.push({ toolId: dir.name, source: 'bundled' });
        }
      }
    }
  }

  // Scan remote MCPs
  const remoteDir = path.join(rootDir, 'src/remote-mcps');
  if (fsToUse.existsSync(remoteDir)) {
    const files = fsToUse.readdirSync(remoteDir);
    for (const file of files) {
      if (file.startsWith('SETUP_') && file.endsWith('.md')) {
        // Extract tool ID from SETUP_{toolId}.md
        const toolId = file.substring(6, file.length - 3);
        available.push({ toolId, source: 'remote' });
      }
    }
  }

  // Scan local MCPs (same location as remote, but we'll mark them separately)
  // Note: In practice, local and remote MCPs share the same SETUP files in src/remote-mcps
  // This scan is here for completeness and future extensibility
  const localDir = path.join(rootDir, 'src/remote-mcps');
  if (fsToUse.existsSync(localDir)) {
    const files = fsToUse.readdirSync(localDir);
    for (const file of files) {
      if (file.startsWith('SETUP_') && file.endsWith('.md')) {
        // Extract tool ID from SETUP_{toolId}.md
        const toolId = file.substring(6, file.length - 3);
        // Only add if not already present as remote
        if (!available.some((item) => item.toolId === toolId && item.source === 'remote')) {
          available.push({ toolId, source: 'local' });
        }
      }
    }
  }

  return available;
}
