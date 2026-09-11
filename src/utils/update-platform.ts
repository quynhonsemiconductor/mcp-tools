import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Get the path to the currently running binary
 */
export const getCurrentBinaryPath = (): string | null => {
  try {
    const processPath = process.execPath;

    if (fs.existsSync(processPath)) {
      return processPath;
    }

    return null;
  } catch (error) {
    console.error('Failed to determine current binary path:', error);
    return null;
  }
};

/**
 * Get the directory of the currently running binary
 * Returns null if it cannot be determined
 */
export const getCurrentBinaryDir = (): string | null => {
  const binaryPath = getCurrentBinaryPath();
  if (binaryPath) {
    return path.dirname(binaryPath);
  }
  return null;
};

/**
 * Get the platform and architecture information
 * Maps to the binary naming convention used in releases:
 * - Linux x64: qnsc-mcp-linux-x64
 * - Linux arm64: qnsc-mcp-linux-arm64
 * - macOS x64: qnsc-mcp-macos-x64
 * - macOS arm64: qnsc-mcp-macos-arm64
 * - Windows x64: qnsc-mcp-win-x64.exe
 */
export const getPlatformInfo = (): {
  platform: string;
  arch: string;
  binaryName: string;
} => {
  const platform = os.platform();
  const arch = os.arch();

  let formattedPlatform: string;
  switch (platform) {
    case 'darwin':
      formattedPlatform = 'macos';
      break;
    case 'win32':
      formattedPlatform = 'win';
      break;
    default:
      formattedPlatform = 'linux';
  }

  const formattedArch = arch === 'arm64' ? 'arm64' : 'x64';

  // Special case for Windows which only has x64 build
  let binaryName: string;
  if (platform === 'win32') {
    binaryName = 'qnsc-mcp-win-x64.exe';
  } else {
    binaryName = `qnsc-mcp-${formattedPlatform}-${formattedArch}`;
  }

  return {
    platform: formattedPlatform,
    arch: formattedArch,
    binaryName,
  };
};
