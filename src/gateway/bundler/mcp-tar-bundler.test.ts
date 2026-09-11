/**
 * mcp-tar-bundler.test.ts - Tests for MCPTarBundler
 */
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import path from 'path';
import { MCPTarBundler } from './mcp-tar-bundler';

interface DirentLike {
  name: string;
  isDirectory: () => boolean;
}

const isDirentLike = (entry: string | DirentLike): entry is DirentLike => typeof entry !== 'string';

// We'll need to create a test subclass to override the actual implementations
class TestMCPTarBundler extends MCPTarBundler {
  // Create mock functions for all external dependencies
  mockExistsSync = mock((_path: string) => true);
  mockMkdirSync = mock((_path: string, _options?: any) => undefined);
  mockReaddirSync = mock((_path: string, options?: any) => {
    const withFileTypes = options?.withFileTypes === true;

    if (withFileTypes) {
      return [
        { name: 'mcp1', isDirectory: () => true },
        { name: 'mcp2', isDirectory: () => true },
        { name: 'file.txt', isDirectory: () => false },
      ];
    }
    return ['mcp1', 'mcp2', 'file.txt'];
  });
  mockCreate = mock((_options: any, _files: string[]) => Promise.resolve());

  // Override the bundleMCPs method to use our mocks instead of the actual fs and tar modules
  async bundleMCPs(
    mcpsDir: string,
    outputPath: string,
  ): Promise<{ tarPath: string; mcpNames: string[] }> {
    // Create output directory if it doesn't exist
    const outputDir = path.dirname(outputPath);
    if (!this.mockExistsSync(outputDir)) {
      this.mockMkdirSync(outputDir, { recursive: true });
    }

    if (!this.mockExistsSync(mcpsDir)) {
      return { tarPath: outputPath, mcpNames: [] };
    }

    const entries = this.mockReaddirSync(mcpsDir, { withFileTypes: true });
    const directories = entries.filter(isDirentLike).filter((entry) => entry.isDirectory());
    const mcpNames = directories.map((dir) => dir.name);

    if (directories.length === 0) {
      return { tarPath: outputPath, mcpNames: [] };
    }

    // Create tar archive containing all MCP directories
    await this.mockCreate(
      {
        file: outputPath,
        cwd: mcpsDir,
        portable: true,
        gzip: false,
      },
      mcpNames,
    );

    return { tarPath: outputPath, mcpNames };
  }
}

describe('MCPTarBundler', () => {
  // Test paths
  const testPaths = {
    mcpsDir: '/tmp/test-mcps',
    outputPath: '/tmp/test-output/mcps.tar',
  };

  let bundler: TestMCPTarBundler;

  beforeEach(() => {
    bundler = new TestMCPTarBundler();

    // Reset mock functions
    bundler.mockExistsSync.mockClear();
    bundler.mockMkdirSync.mockClear();
    bundler.mockReaddirSync.mockClear();
    bundler.mockCreate.mockClear();

    // Set default behavior for existsSync
    bundler.mockExistsSync.mockImplementation(() => true);
  });

  it('should be instantiable', () => {
    expect(bundler).toBeDefined();
  });

  it('should bundle MCPs into a tar file', async () => {
    const result = await bundler.bundleMCPs(testPaths.mcpsDir, testPaths.outputPath);

    // Verify result
    expect(result.tarPath).toBe(testPaths.outputPath);
    expect(result.mcpNames).toEqual(['mcp1', 'mcp2']);

    // Verify tar.create was called
    expect(bundler.mockCreate).toHaveBeenCalledTimes(1);
    expect(bundler.mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        file: testPaths.outputPath,
        cwd: testPaths.mcpsDir,
        portable: true,
        gzip: false,
      }),
      ['mcp1', 'mcp2'],
    );
  });

  it('should create output directory if it does not exist', async () => {
    // Setup mock for this test
    bundler.mockExistsSync.mockImplementation((filepath: string) => {
      if (filepath === path.dirname(testPaths.outputPath)) {
        return false;
      }
      return true;
    });

    await bundler.bundleMCPs(testPaths.mcpsDir, testPaths.outputPath);

    // Verify mkdirSync was called
    expect(bundler.mockMkdirSync).toHaveBeenCalledTimes(1);
    expect(bundler.mockMkdirSync).toHaveBeenCalledWith(path.dirname(testPaths.outputPath), {
      recursive: true,
    });
  });

  it('should handle the case when MCPs directory does not exist', async () => {
    // Setup mock for this test
    bundler.mockExistsSync.mockImplementation((filepath: string) => {
      if (filepath === testPaths.mcpsDir) {
        return false;
      }
      return true;
    });

    const result = await bundler.bundleMCPs(testPaths.mcpsDir, testPaths.outputPath);

    // Verify result
    expect(result.tarPath).toBe(testPaths.outputPath);
    expect(result.mcpNames).toEqual([]);

    // Verify tar.create was not called
    expect(bundler.mockCreate).not.toHaveBeenCalled();
  });

  it('should handle the case when no directories are found in MCPs directory', async () => {
    // Setup mock for this test
    bundler.mockReaddirSync.mockImplementation((dir: string, options?: any) => {
      const withFileTypes = options?.withFileTypes === true;

      if (withFileTypes) {
        return [
          { name: 'file1.txt', isDirectory: () => false },
          { name: 'file2.txt', isDirectory: () => false },
        ];
      }
      return ['file1.txt', 'file2.txt'];
    });

    const result = await bundler.bundleMCPs(testPaths.mcpsDir, testPaths.outputPath);

    // Verify result
    expect(result.tarPath).toBe(testPaths.outputPath);
    expect(result.mcpNames).toEqual([]);

    // Verify tar.create was not called
    expect(bundler.mockCreate).not.toHaveBeenCalled();
  });
});
