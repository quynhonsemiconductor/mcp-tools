/**
 * Platform detection and binary path utilities for cross-platform testing
 */

import { existsSync } from 'fs';
import { platform } from 'os';
import { join, resolve } from 'path';

/**
 * Supported operating systems
 */
export type Platform = 'windows' | 'macos' | 'linux';

/**
 * Detects the current operating system
 * @returns The detected platform
 */
export function detectPlatform(): Platform {
  const os = platform();
  switch (os) {
    case 'win32':
      return 'windows';
    case 'darwin':
      return 'macos';
    case 'linux':
      return 'linux';
    default:
      throw new Error(`Unsupported platform: ${os}`);
  }
}

/**
 * Checks if the current platform is Windows
 */
export function isWindows(): boolean {
  return detectPlatform() === 'windows';
}

/**
 * Gets the appropriate binary extension for the current platform
 * @returns '.exe' on Windows, empty string on Unix-like systems
 */
export function getBinaryExtension(): string {
  return isWindows() ? '.exe' : '';
}

/**
 * Resolves the binary path, adding .exe extension on Windows if needed
 * @param binaryPath - The path to the binary (with or without extension)
 * @returns The resolved path with appropriate extension
 */
export function resolveBinaryPath(binaryPath: string): string {
  const absolutePath = resolve(binaryPath);
  
  // If the path already has an extension, use it as-is
  if (absolutePath.endsWith('.exe')) {
    return absolutePath;
  }
  
  // On Windows, try with .exe extension first
  if (isWindows()) {
    const withExe = `${absolutePath}.exe`;
    if (existsSync(withExe)) {
      return withExe;
    }
  }
  
  // Return the path as-is (works for Unix or if Windows binary has no extension)
  return absolutePath;
}

/**
 * Finds the binary in common locations
 * @param binaryName - The base name of the binary (e.g., 'qnsc-mcp')
 * @param searchPaths - Additional paths to search
 * @param version - Optional specific version to find (e.g., '3.2.0', '3.3.0-beta.3')
 * @returns The path to the binary if found, null otherwise
 */
export function findBinary(
  binaryName: string = 'qnsc-mcp',
  searchPaths: string[] = [],
  version?: string
): string | null {
  const ext = getBinaryExtension();
  const binaryWithExt = binaryName.endsWith(ext) ? binaryName : `${binaryName}${ext}`;
  
  // Platform-specific binary name (e.g., qnsc-mcp-win-x64.exe)
  const platform = detectPlatform();
  const platformName = platform === 'windows' ? 'win' : platform;
  const platformBinaryName = `qnsc-mcp-${platformName}-${getArchitecture()}${ext}`;
  
  // Cache directory for versioned binaries
  const smokeBinariesDir = resolve(__dirname, '../../../.smoke-test-binaries');
  
  // If version specified, ONLY look for versioned binary in the cache
  if (version) {
    const versionedBinaryName = `qnsc-mcp-${platformName}-${getArchitecture()}-${version.replace(/^v/, '')}${ext}`;
    const candidatePath = join(smokeBinariesDir, versionedBinaryName);
    if (existsSync(candidatePath)) {
      return resolve(candidatePath);
    }
    // Also check custom search paths for versioned binary
    for (const searchPath of searchPaths) {
      const customPath = join(searchPath, versionedBinaryName);
      if (existsSync(customPath)) {
        return resolve(customPath);
      }
    }
    // Version specified but not found - return null (don't fall back to other binaries)
    return null;
  }
  
  // No version specified - search for any binary in standard locations
  const defaultPaths = [
    // Smoke test binaries cache
    smokeBinariesDir,
    // Current directory
    '.',
    // Project root
    resolve(__dirname, '../../..'),
    // Common build output directories
    resolve(__dirname, '../../../dist'),
    resolve(__dirname, '../../../build'),
    // Platform-specific directories
    resolve(__dirname, `../../../qnsc-mcp-${detectPlatform()}-${getArchitecture()}`),
  ];
  
  const allPaths = [...searchPaths, ...defaultPaths];
  
  // Try platform-specific binary name in all paths
  for (const searchPath of allPaths) {
    const candidatePath = join(searchPath, platformBinaryName);
    if (existsSync(candidatePath)) {
      return resolve(candidatePath);
    }
  }
  
  // Then try generic binary name
  for (const searchPath of allPaths) {
    const candidatePath = join(searchPath, binaryWithExt);
    if (existsSync(candidatePath)) {
      return resolve(candidatePath);
    }
  }
  
  return null;
}

/**
 * Gets the CPU architecture string used in binary names
 * @returns Architecture string (e.g., 'x64', 'arm64')
 */
export function getArchitecture(): string {
  const arch = process.arch;
  switch (arch) {
    case 'x64':
      return 'x64';
    case 'arm64':
      return 'arm64';
    case 'ia32':
      return 'x86';
    default:
      return arch;
  }
}

/**
 * Gets the platform-architecture combo used in binary directory names
 * @returns Platform-architecture string (e.g., 'windows-x64', 'macos-arm64')
 */
export function getPlatformArch(): string {
  return `${detectPlatform()}-${getArchitecture()}`;
}

/**
 * Validates that a binary exists and is accessible
 * @param binaryPath - Path to the binary
 * @returns Object with validation result and details
 */
export function validateBinary(binaryPath: string): {
  valid: boolean;
  resolvedPath: string | null;
  error?: string;
} {
  try {
    const resolved = resolveBinaryPath(binaryPath);
    
    if (!existsSync(resolved)) {
      return {
        valid: false,
        resolvedPath: null,
        error: `Binary not found at: ${resolved}`
      };
    }
    
    return {
      valid: true,
      resolvedPath: resolved
    };
  } catch (error) {
    return {
      valid: false,
      resolvedPath: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}


