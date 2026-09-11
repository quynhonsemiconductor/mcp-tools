import { beforeEach, describe, expect, it } from 'bun:test';
import { mockFS, mockOs } from '../test-utils/mocks';

import { getCurrentBinaryDir, getCurrentBinaryPath, getPlatformInfo } from './update-platform';

// Platform control
let platformValue = 'darwin';
let archValue = 'arm64';
mockOs.platform.mockImplementation(() => platformValue);
mockOs.arch.mockImplementation(() => archValue);

// Process mock
Object.defineProperty(process, 'execPath', {
  value: '/usr/local/bin/qnsc-mcp',
  configurable: true,
});

describe('update-platform', () => {
  beforeEach(() => {
    mockFS.existsSync.mockClear();
    platformValue = 'darwin';
    archValue = 'arm64';
  });

  describe('getCurrentBinaryPath', () => {
    it('should return process.execPath when file exists', () => {
      mockFS.existsSync.mockReturnValue(true);

      const result = getCurrentBinaryPath();

      expect(result).toBe('/usr/local/bin/qnsc-mcp');
    });

    it('should return null when file does not exist', () => {
      mockFS.existsSync.mockReturnValue(false);

      const result = getCurrentBinaryPath();

      expect(result).toBe(null);
    });
  });

  describe('getCurrentBinaryDir', () => {
    it('should return directory of binary path', () => {
      mockFS.existsSync.mockReturnValue(true);

      const result = getCurrentBinaryDir();

      expect(result).toBe('/usr/local/bin');
    });

    it('should return null when binary path cannot be determined', () => {
      mockFS.existsSync.mockReturnValue(false);

      const result = getCurrentBinaryDir();

      expect(result).toBe(null);
    });
  });

  describe('getPlatformInfo', () => {
    it('should return macos-arm64 for darwin arm64', () => {
      platformValue = 'darwin';
      archValue = 'arm64';

      const result = getPlatformInfo();

      expect(result.platform).toBe('macos');
      expect(result.arch).toBe('arm64');
      expect(result.binaryName).toBe('qnsc-mcp-macos-arm64');
    });

    it('should return macos-x64 for darwin x64', () => {
      platformValue = 'darwin';
      archValue = 'x64';

      const result = getPlatformInfo();

      expect(result.platform).toBe('macos');
      expect(result.arch).toBe('x64');
      expect(result.binaryName).toBe('qnsc-mcp-macos-x64');
    });

    it('should return linux-arm64 for linux arm64', () => {
      platformValue = 'linux';
      archValue = 'arm64';

      const result = getPlatformInfo();

      expect(result.platform).toBe('linux');
      expect(result.arch).toBe('arm64');
      expect(result.binaryName).toBe('qnsc-mcp-linux-arm64');
    });

    it('should return linux-x64 for linux x64', () => {
      platformValue = 'linux';
      archValue = 'x64';

      const result = getPlatformInfo();

      expect(result.platform).toBe('linux');
      expect(result.arch).toBe('x64');
      expect(result.binaryName).toBe('qnsc-mcp-linux-x64');
    });

    it('should return win-x64.exe for windows (always x64)', () => {
      platformValue = 'win32';
      archValue = 'x64';

      const result = getPlatformInfo();

      expect(result.platform).toBe('win');
      expect(result.arch).toBe('x64');
      expect(result.binaryName).toBe('qnsc-mcp-win-x64.exe');
    });

    it('should return win-x64.exe even for windows arm64', () => {
      platformValue = 'win32';
      archValue = 'arm64';

      const result = getPlatformInfo();

      // Windows only has x64 build
      expect(result.binaryName).toBe('qnsc-mcp-win-x64.exe');
    });

    it('should treat unknown architectures as x64', () => {
      platformValue = 'darwin';
      archValue = 'ia32';

      const result = getPlatformInfo();

      expect(result.arch).toBe('x64');
    });
  });
});
