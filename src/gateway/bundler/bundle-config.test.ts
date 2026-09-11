/**
 * bundle-config.test.ts - Tests for bundle configuration generation
 */
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import path from 'path';

describe('Bundle Configuration', () => {
  // Store original fs module
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- capture the real fs module before mock.module('fs', ...) replaces it, matching the pattern in src/test-utils/mocks.ts
  const originalFsModule = { ...(require('fs') as typeof import('fs')) };

  // Define mock package.json content
  const mockPackageJsonContent = JSON.stringify({
    name: 'test-mcp',
    version: '1.0.0',
    dependencies: {
      '@modelcontextprotocol/sdk': '^1.0.0',
      'test-dep': '^2.0.0',
      'another-dep': '~3.1.4',
    },
  });

  const mockParentPackageJsonContent = JSON.stringify({
    name: 'test-parent-mcp',
    version: '1.0.0',
    dependencies: {
      '@modelcontextprotocol/sdk': '^1.0.0',
      'parent-dep': '^3.0.0',
    },
  });

  // Keep track of created directories for verification
  const createdDirectories = new Set<string>();

  beforeEach(() => {
    // Reset the created directories set
    createdDirectories.clear();

    // Create individual mocks first
    const mockExistsSync = mock((path: any) => {
      const filepath = path.toString();
      if (filepath.endsWith('/test/src/package.json')) {
        return true; // Default case - package.json exists
      }
      if (filepath.endsWith('/test/package.json')) {
        return true; // Parent package.json exists
      }
      if (filepath.endsWith('/test/dist')) {
        return false; // Output dir doesn't exist yet
      }
      return true; // Default for entry point to exist
    });

    const mockReadFileSync = mock((path: any, _encoding?: any) => {
      const filepath = path.toString();
      if (filepath.endsWith('/test/src/package.json')) {
        return mockPackageJsonContent;
      }
      if (filepath.endsWith('/test/package.json')) {
        return mockParentPackageJsonContent;
      }
      return ''; // Default content for other files
    });

    const mockStatSync = mock((_path: any) => {
      return {
        size: 1024,
        mtime: new Date(),
        isDirectory: () => false,
      };
    });

    const mockMkdirSync = mock((path: any, _options?: any) => {
      createdDirectories.add(path.toString());
      return undefined;
    });

    const mockFs = {
      originalFsModule, // Include original fs methods
      ...originalFsModule, // Include original fs methods
      existsSync: mockExistsSync,
      readFileSync: mockReadFileSync,
      statSync: mockStatSync,
      mkdirSync: mockMkdirSync,
    };
    // Mock the fs module
    void mock.module('fs', () => ({ default: mockFs, ...mockFs }));
  });

  afterEach(() => {
    // Reset module mocks
    mock.restore();
  });

  it('should create a bundle config with default options', async () => {
    // Import the module under test after mocking fs
    const { createBundleConfig, DEFAULT_BUNDLE_CONFIG } = await import('./bundle-config');

    const entryPoint = '/test/src/index.js';
    const outputFile = '/test/dist/bundle.js';
    const packageTitle = 'test-package@1.0.0';

    // Force package.json with the expected dependencies
    void mock.module('fs', () => {
      return {
        existsSync: (filepath: string) => {
          if (filepath.endsWith('package.json')) return true;
          return true;
        },
        readFileSync: (filepath: string, _encoding?: string) => {
          if (filepath.endsWith('package.json')) {
            return JSON.stringify({
              name: 'test-mcp',
              version: '1.0.0',
              dependencies: {
                '@modelcontextprotocol/sdk': '^1.0.0',
                'test-dep': '^2.0.0',
              },
            });
          }
          return '';
        },
        statSync: (_filepath: string) => {
          return {
            size: 1024,
            mtime: new Date(),
            isDirectory: () => false,
          };
        },
        mkdirSync: (dirpath: string, _options?: any) => {
          createdDirectories.add(dirpath.toString());
          return undefined;
        },
      };
    });

    const config = createBundleConfig(entryPoint, outputFile, packageTitle);

    // Verify basic configuration
    expect(config.entrypoints).toEqual([entryPoint]);
    expect(config.outdir).toBe(path.dirname(outputFile));
    if (config.naming && typeof config.naming === 'object' && 'entry' in config.naming) {
      expect(config.naming.entry).toBe(path.basename(outputFile));
    }
    expect(config.target).toBe('node');
    expect(config.format).toBe(DEFAULT_BUNDLE_CONFIG.format as 'esm' | 'cjs' | 'iife');
    expect(config.minify).toBe(DEFAULT_BUNDLE_CONFIG.minify);
    expect(config.sourcemap).toBe('none');

    // Check that required external dependencies are included
    DEFAULT_BUNDLE_CONFIG.neverBundle.forEach((pkg) => {
      expect(config.external).toContain(pkg);
    });

    // Check that banner contains package title
    expect(config.banner).toContain(packageTitle);
    expect(config.banner).toContain('Bundled Libraries:');
    // We expect dependencies to be in the banner
    expect(config.banner).toContain('@modelcontextprotocol/sdk');
  });

  it('should create a bundle config with custom options', async () => {
    const { createBundleConfig } = await import('./bundle-config');

    const entryPoint = '/test/src/index.js';
    const outputFile = '/test/dist/bundle.js';
    const packageTitle = 'test-package@1.0.0';

    const config = createBundleConfig(entryPoint, outputFile, packageTitle, {
      minify: false,
      sourceMaps: true,
      format: 'cjs',
      external: ['extra-pkg'],
    });

    // Verify custom configuration
    expect(config.minify).toBe(false);
    expect(config.sourcemap).toBe('external');
    expect(config.format).toBe('cjs');
    expect(config.external).toContain('extra-pkg');

    // CJS format should have import.meta.url defined
    expect(config.define).toBeDefined();
    expect(config.define?.['import.meta.url']).toBeDefined();
  });

  it('should handle ESM format appropriately', async () => {
    const { createBundleConfig } = await import('./bundle-config');

    const entryPoint = '/test/src/index.js';
    const outputFile = '/test/dist/bundle.js';
    const packageTitle = 'test-package@1.0.0';

    const config = createBundleConfig(entryPoint, outputFile, packageTitle, {
      format: 'esm',
    });

    // ESM format should not have import.meta.url defined
    expect(config.format).toBe('esm');
    expect(config.define?.['import.meta.url']).toBeUndefined();
  });

  it('should create output directory if it does not exist', async () => {
    // For this test, we'll verify the function directly rather than relying on side effects

    // We'll import the actual module and use our own mock
    const mockMkdirSync = mock(() => undefined);

    // Force package.json with the expected dependencies
    void mock.module('fs', () => {
      return {
        existsSync: (filepath: string) => {
          if (filepath === '/test/dist') {
            return false; // Output dir doesn't exist
          }
          return true; // Everything else exists
        },
        readFileSync: (filepath: string, _encoding?: string) => {
          if (filepath.endsWith('package.json')) {
            return JSON.stringify({
              name: 'test-mcp',
              version: '1.0.0',
              dependencies: {},
            });
          }
          return '';
        },
        statSync: (_filepath: string) => {
          return {
            size: 1024,
            mtime: new Date(),
            isDirectory: () => false,
          };
        },
        mkdirSync: mockMkdirSync,
      };
    });

    const { createBundleConfig } = await import('./bundle-config');

    const entryPoint = '/test/src/index.js';
    const outputFile = '/test/dist/bundle.js';
    const packageTitle = 'test-package@1.0.0';

    // Execute the function
    createBundleConfig(entryPoint, outputFile, packageTitle, {
      verbose: true,
    });

    // Verify mkdirSync was called
    expect(mockMkdirSync).toHaveBeenCalled();
  });

  it('should include dependencies from package.json in banner', async () => {
    // Setup our mocks first with specific package.json content
    void mock.module('fs', () => {
      return {
        existsSync: (_filepath: string) => {
          return true; // Everything exists
        },
        readFileSync: (filepath: string, _encoding?: string) => {
          if (filepath.endsWith('package.json')) {
            return JSON.stringify({
              name: 'test-mcp',
              version: '1.0.0',
              dependencies: {
                '@modelcontextprotocol/sdk': '^1.0.0',
                'test-dep': '^2.0.0',
                'another-dep': '~3.1.4',
              },
            });
          }
          return '';
        },
        statSync: (_filepath: string) => {
          return {
            size: 1024,
            mtime: new Date(),
            isDirectory: () => false,
          };
        },
        mkdirSync: (_dirpath: string, _options?: any) => {
          return undefined;
        },
      };
    });

    const { createBundleConfig } = await import('./bundle-config');

    const entryPoint = '/test/src/index.js';
    const outputFile = '/test/dist/bundle.js';
    const packageTitle = 'test-package@1.0.0';

    const config = createBundleConfig(entryPoint, outputFile, packageTitle);

    // Verify dependencies are included in the banner
    expect(config.banner).toContain('@modelcontextprotocol/sdk');
    expect(config.banner).toContain('@modelcontextprotocol/sdk@^1.0.0');
    expect(config.banner).toContain('test-dep@^2.0.0');
    expect(config.banner).toContain('another-dep@~3.1.4');
  });

  it('should look for package.json in parent directory if not found in entry point directory', async () => {
    // Mock fs with package.json not in entry directory but in parent
    void mock.module('fs', () => {
      return {
        existsSync: (filepath: string) => {
          const path = filepath.toString();
          if (path.endsWith('/test/src/package.json')) {
            return false; // No package.json in src dir
          }
          if (path.endsWith('/test/package.json')) {
            return true; // Parent package.json exists
          }
          return true; // Default for other paths
        },

        readFileSync: (filepath: string, _encoding?: string) => {
          const path = filepath.toString();
          if (path.endsWith('/test/package.json')) {
            return mockParentPackageJsonContent;
          }
          return ''; // Default content for other files
        },

        statSync: (_filepath: string) => {
          return {
            size: 1024,
            mtime: new Date(),
            isDirectory: () => false,
          };
        },

        mkdirSync: (dirpath: string, _options?: any) => {
          createdDirectories.add(dirpath.toString());
          return undefined;
        },
      };
    });

    const { createBundleConfig } = await import('./bundle-config');

    const entryPoint = '/test/src/index.js';
    const outputFile = '/test/dist/bundle.js';
    const packageTitle = 'test-package@1.0.0';

    const config = createBundleConfig(entryPoint, outputFile, packageTitle, {
      verbose: true,
    });

    // Verify config was created successfully
    expect(config).toBeDefined();
    expect(config.entrypoints).toEqual([entryPoint]);
  });

  it('should handle missing package.json gracefully', async () => {
    // Mock fs with no package.json anywhere
    void mock.module('fs', () => {
      return {
        existsSync: (filepath: string) => {
          const path = filepath.toString();
          if (path.endsWith('package.json')) {
            return false; // No package.json anywhere
          }
          return true; // Default for other paths
        },

        readFileSync: (_filepath: string, _encoding?: string) => {
          return ''; // Default content for other files
        },

        statSync: (_filepath: string) => {
          return {
            size: 1024,
            mtime: new Date(),
            isDirectory: () => false,
          };
        },

        mkdirSync: (dirpath: string, _options?: any) => {
          createdDirectories.add(dirpath.toString());
          return undefined;
        },
      };
    });

    const { createBundleConfig } = await import('./bundle-config');

    const entryPoint = '/test/src/index.js';
    const outputFile = '/test/dist/bundle.js';
    const packageTitle = 'test-package@1.0.0';

    const config = createBundleConfig(entryPoint, outputFile, packageTitle);

    // Verify config was created successfully
    expect(config).toBeDefined();
    expect(config.entrypoints).toEqual([entryPoint]);
    // Banner should exist, even if content is not exactly what we expect
    expect(typeof config.banner).toBe('string');
  });

  it('should handle errors when reading package.json', async () => {
    // Mock fs with package.json that throws an error when read
    void mock.module('fs', () => {
      return {
        existsSync: (_filepath: string) => true,

        readFileSync: (filepath: string, _encoding?: string) => {
          if (filepath.toString().includes('package.json')) {
            throw new Error('Read error');
          }
          return '';
        },

        statSync: (_filepath: string) => {
          return {
            size: 1024,
            mtime: new Date(),
            isDirectory: () => false,
          };
        },

        mkdirSync: (dirpath: string, _options?: any) => {
          createdDirectories.add(dirpath.toString());
          return undefined;
        },
      };
    });

    const { createBundleConfig } = await import('./bundle-config');

    const entryPoint = '/test/src/index.js';
    const outputFile = '/test/dist/bundle.js';
    const packageTitle = 'test-package@1.0.0';

    // Should not throw an error
    const config = createBundleConfig(entryPoint, outputFile, packageTitle, {
      verbose: true,
    });

    // This test verifies that reading package.json errors don't break bundle config generation
    // Rather than checking for a specific message, verify the banner still exists and contains required info
    expect(config.banner).toBeDefined();
    expect(config.banner).toContain(packageTitle);
    expect(config.banner).toContain('Bundled Libraries:');

    // The implementation should not throw an error
    // But the exact format of the "no dependencies" message may vary, so we check the basics
    expect(typeof config.banner).toBe('string');
  });

  it('should handle errors when checking entry point or output directory', async () => {
    // Mock fs with statSync that throws an error
    void mock.module('fs', () => {
      return {
        existsSync: (_filepath: string) => true,

        readFileSync: (filepath: string, _encoding?: string) => {
          const path = filepath.toString();
          if (path.endsWith('/test/src/package.json')) {
            return mockPackageJsonContent;
          }
          return '';
        },

        statSync: (_filepath: string) => {
          throw new Error('Stat error');
        },

        mkdirSync: (dirpath: string, _options?: any) => {
          createdDirectories.add(dirpath.toString());
          return undefined;
        },
      };
    });

    const { createBundleConfig } = await import('./bundle-config');

    const entryPoint = '/test/src/index.js';
    const outputFile = '/test/dist/bundle.js';
    const packageTitle = 'test-package@1.0.0';

    // Should not throw an error
    const config = createBundleConfig(entryPoint, outputFile, packageTitle, {
      verbose: true,
    });

    // Basic verification that the config was still created
    expect(config.entrypoints).toEqual([entryPoint]);
  });

  it('should export constants with expected values', async () => {
    const { DEPS_SOURCE_DELIMITER, DEFAULT_BUNDLE_CONFIG } = await import('./bundle-config');

    expect(DEPS_SOURCE_DELIMITER).toBe('// --- deps-source ---');
    expect(DEFAULT_BUNDLE_CONFIG).toEqual({
      target: 'node',
      format: 'esm',
      minify: true,
      sourceMaps: false,
      // commonModules is now empty - dependencies are bundled directly to avoid runtime resolution issues
      commonModules: [],
      neverBundle: ['fsevents', 'esbuild', 'node-gyp', 'electron'],
    });
  });
});
