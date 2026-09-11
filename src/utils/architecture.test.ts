import { describe, it, expect, mock, beforeEach } from 'bun:test';
import {
  detectArchitecture,
  getArchitectureMismatchWarning,
  getRecommendedBinaryName,
} from './architecture';

// Mock child_process.execSync
const mockExecSync = mock(() => '');
void mock.module('child_process', () => ({
  execSync: mockExecSync,
}));

describe('Architecture Detection', () => {
  beforeEach(() => {
    mock.restore();
    mockExecSync.mockImplementation(() => '');
  });

  describe('detectArchitecture', () => {
    it('should detect x64 on Apple Silicon via Rosetta', () => {
      // Mock process.arch and process.platform
      const originalArch = process.arch;
      const originalPlatform = process.platform;

      Object.defineProperty(process, 'arch', { value: 'x64', configurable: true });
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

      mockExecSync.mockReturnValue('Apple M1');

      const result = detectArchitecture();

      expect(result.processArch).toBe('x64');
      expect(result.systemArch).toBe('arm64');
      expect(result.isMismatch).toBe(true);
      expect(result.isX64OnAppleSilicon).toBe(true);
      expect(result.platform).toBe('darwin');
      expect(result.recommendedArch).toBe('arm64');

      // Restore original values
      Object.defineProperty(process, 'arch', { value: originalArch, configurable: true });
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should detect no mismatch when architectures match', () => {
      const originalArch = process.arch;
      const originalPlatform = process.platform;

      Object.defineProperty(process, 'arch', { value: 'arm64', configurable: true });
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

      mockExecSync.mockReturnValue('Apple M1');

      const result = detectArchitecture();

      expect(result.processArch).toBe('arm64');
      expect(result.systemArch).toBe('arm64');
      expect(result.isMismatch).toBe(false);
      expect(result.isX64OnAppleSilicon).toBe(false);

      Object.defineProperty(process, 'arch', { value: originalArch, configurable: true });
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should handle sysctl failure gracefully', () => {
      const originalArch = process.arch;
      const originalPlatform = process.platform;

      Object.defineProperty(process, 'arch', { value: 'x64', configurable: true });
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

      mockExecSync.mockImplementation(() => {
        throw new Error('sysctl failed');
      });

      const result = detectArchitecture();

      // Should assume system matches process when detection fails
      expect(result.processArch).toBe('x64');
      expect(result.systemArch).toBe('x64');
      expect(result.isMismatch).toBe(false);
      expect(result.isX64OnAppleSilicon).toBe(false);

      Object.defineProperty(process, 'arch', { value: originalArch, configurable: true });
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });

  describe('getRecommendedBinaryName', () => {
    it('should return correct binary name for macOS arm64', () => {
      const archInfo = {
        processArch: 'x64',
        systemArch: 'arm64',
        isMismatch: true,
        isX64OnAppleSilicon: true,
        platform: 'darwin',
        recommendedArch: 'arm64',
      };

      const result = getRecommendedBinaryName(archInfo);
      expect(result).toBe('qnsc-mcp-macos-arm64');
    });

    it('should return correct binary name for Windows x64', () => {
      const archInfo = {
        processArch: 'x64',
        systemArch: 'x64',
        isMismatch: false,
        isX64OnAppleSilicon: false,
        platform: 'win32',
        recommendedArch: 'x64',
      };

      const result = getRecommendedBinaryName(archInfo);
      expect(result).toBe('qnsc-mcp-windows-x64.exe');
    });

    it('should return correct binary name for Linux arm64', () => {
      const archInfo = {
        processArch: 'x64',
        systemArch: 'arm64',
        isMismatch: true,
        isX64OnAppleSilicon: false,
        platform: 'linux',
        recommendedArch: 'arm64',
      };

      const result = getRecommendedBinaryName(archInfo);
      expect(result).toBe('qnsc-mcp-linux-arm64');
    });
  });

  describe('getArchitectureMismatchWarning', () => {
    it('should return warning for x64 on Apple Silicon', () => {
      const archInfo = {
        processArch: 'x64',
        systemArch: 'arm64',
        isMismatch: true,
        isX64OnAppleSilicon: true,
        platform: 'darwin',
        recommendedArch: 'arm64',
      };

      const warning = getArchitectureMismatchWarning(archInfo);
      expect(warning).toContain('Intel (x64) binary on Apple Silicon');
      expect(warning).toContain('qnsc-mcp-macos-arm64');
      expect(warning).toContain('releases/latest');
    });

    it('should return generic warning for other mismatches', () => {
      const archInfo = {
        processArch: 'x64',
        systemArch: 'arm64',
        isMismatch: true,
        isX64OnAppleSilicon: false,
        platform: 'linux',
        recommendedArch: 'arm64',
      };

      const warning = getArchitectureMismatchWarning(archInfo);
      expect(warning).toContain('Architecture mismatch detected');
      expect(warning).toContain('Binary architecture: x64');
      expect(warning).toContain('System architecture: arm64');
      expect(warning).toContain('qnsc-mcp-linux-arm64');
    });

    it('should return null when no mismatch', () => {
      const archInfo = {
        processArch: 'arm64',
        systemArch: 'arm64',
        isMismatch: false,
        isX64OnAppleSilicon: false,
        platform: 'darwin',
        recommendedArch: 'arm64',
      };

      const warning = getArchitectureMismatchWarning(archInfo);
      expect(warning).toBeNull();
    });
  });
});
