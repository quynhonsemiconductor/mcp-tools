/**
 * dependency-analyzer.test.ts - Tests for DependencyAnalyzer
 *
 * NOTE: These tests use mock.module at the top level to ensure mocks are
 * registered before the DependencyAnalyzer module is imported.
 * The mocks are set up BEFORE the import, not in beforeEach.
 */
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import * as path from 'path';
import { testPaths } from '../__mocks__/mcp-fixtures';
// Import the real fs module BEFORE mocking to avoid circular reference
import * as realFs from 'fs';

// Mock paths to avoid real filesystem access
const testDir = testPaths.testRepoPath;
const _packageJsonPath = path.join(testDir, 'package.json');

// Mock function implementations - these can be overridden per test
let readFileImpl: (filepath: any, options?: any) => Promise<string | Buffer>;
let readdirImpl: (dirPath: any, options?: any) => Promise<any>;
let statImpl: (filepath: any) => Promise<any>;
let readFileSyncImpl: (filepath: any, options?: any) => string | Buffer;

// Default implementations
const defaultReadFileImpl = async (filepath: any, _options?: any): Promise<string | Buffer> => {
  const pathStr = filepath.toString();
  if (pathStr.endsWith('package.json')) {
    return JSON.stringify({
      name: 'test-mcp',
      version: '1.0.0',
      main: 'index.js',
      dependencies: {
        '@modelcontextprotocol/sdk': '^1.0.0',
        'test-dependency': '^2.0.0',
      },
    });
  }
  if (pathStr.endsWith('index.js')) {
    return `
      import { Tool } from '@modelcontextprotocol/sdk';
      import * as testDep from 'test-dependency';

      class TestTool implements Tool {
        name = 'test_tool';
        description = 'Test tool';

        async execute(params) {
          return { result: testDep.process(params) };
        }
      }

      export default new TestTool();
    `;
  }
  if (pathStr.endsWith('esm-module.js')) {
    return `
      import { useState } from 'react';
      import { v4 as uuidv4 } from 'uuid';

      export function Component() {
        const [id] = useState(uuidv4());
        return id;
      }
    `;
  }
  if (pathStr.endsWith('cjs-module.js')) {
    return `
      const fs = require('fs');
      const path = require('path');
      const axios = require('axios');

      function readConfig() {
        const config = fs.readFileSync(path.join(__dirname, 'config.json'));
        return JSON.parse(config);
      }

      module.exports = { readConfig };
    `;
  }
  return '';
};

const defaultReaddirImpl = async (dirPath: any, options?: any): Promise<any> => {
  const pathStr = dirPath.toString();
  const withFileTypes = options?.withFileTypes === true;

  if (pathStr === testPaths.testRepoPath) {
    if (withFileTypes) {
      return [
        { name: 'index.js', isDirectory: () => false },
        { name: 'package.json', isDirectory: () => false },
        { name: 'src', isDirectory: () => true },
      ];
    }
    return ['index.js', 'package.json', 'src'];
  }

  if (pathStr === path.join(testPaths.testRepoPath, 'src')) {
    if (withFileTypes) {
      return [
        { name: 'utils.js', isDirectory: () => false },
        { name: 'components', isDirectory: () => true },
      ];
    }
    return ['utils.js', 'components'];
  }

  if (pathStr === path.join(testPaths.testRepoPath, 'src', 'components')) {
    if (withFileTypes) {
      return [
        { name: 'esm-module.js', isDirectory: () => false },
        { name: 'cjs-module.js', isDirectory: () => false },
      ];
    }
    return ['esm-module.js', 'cjs-module.js'];
  }

  return [];
};

const defaultStatImpl = async (filepath: any): Promise<any> => {
  const pathStr = filepath.toString();
  return {
    isFile: () =>
      !pathStr.endsWith('node_modules') &&
      !pathStr.endsWith('src') &&
      !pathStr.endsWith('components'),
    isDirectory: () =>
      pathStr.endsWith('node_modules') || pathStr.endsWith('src') || pathStr.endsWith('components'),
    size: 1024,
  };
};

const defaultReadFileSyncImpl = (filepath: any, _options?: any): string | Buffer => {
  const pathStr = filepath.toString();
  if (pathStr.endsWith('package.json')) {
    return JSON.stringify({
      name: 'test-mcp',
      version: '1.0.0',
      type: 'module',
      main: 'index.js',
      dependencies: {
        '@modelcontextprotocol/sdk': '^1.0.0',
        'test-dependency': '^2.0.0',
      },
    });
  }
  return '';
};

// Initialize with defaults
readFileImpl = defaultReadFileImpl;
readdirImpl = defaultReaddirImpl;
statImpl = defaultStatImpl;
readFileSyncImpl = defaultReadFileSyncImpl;

// Set up module mocks BEFORE importing DependencyAnalyzer
// These delegate to the mutable impl functions so we can override per-test
void mock.module('fs/promises', () => ({
  readFile: (filepath: any, options?: any) => readFileImpl(filepath, options),
  readdir: (dirPath: any, options?: any) => readdirImpl(dirPath, options),
  stat: (filepath: any) => statImpl(filepath),
}));

void mock.module('fs', () => {
  return {
    ...realFs,
    default: {
      ...realFs,
      readFileSync: (filepath: any, options?: any) => readFileSyncImpl(filepath, options),
    },
    readFileSync: (filepath: any, options?: any) => readFileSyncImpl(filepath, options),
  };
});

// Now import DependencyAnalyzer AFTER mocks are set up
import { DependencyAnalyzer } from './dependency-analyzer';

describe('DependencyAnalyzer', () => {
  beforeEach(() => {
    // Reset to default implementations before each test
    readFileImpl = defaultReadFileImpl;
    readdirImpl = defaultReaddirImpl;
    statImpl = defaultStatImpl;
    readFileSyncImpl = defaultReadFileSyncImpl;
  });

  // Note: We do NOT call mock.restore() in afterEach because that would
  // clear all module mocks globally, affecting other test files.

  it('should be instantiable', () => {
    const analyzer = new DependencyAnalyzer();
    expect(analyzer).toBeDefined();
  });

  it('should extract declared dependencies from package.json', async () => {
    const analyzer = new DependencyAnalyzer();

    // Use private method access for isolated testing
    const deps = await (analyzer as any).getDeclaredDependencies(testDir);

    expect(deps).toEqual({
      '@modelcontextprotocol/sdk': '^1.0.0',
      'test-dependency': '^2.0.0',
    });
  });

  it('should detect entry point from package.json', async () => {
    const analyzer = new DependencyAnalyzer();

    // Use private method access for isolated testing
    const entryPoint = await (analyzer as any).detectEntryPoint(testDir);

    expect(entryPoint).toBe('index.js');
  });

  it('should detect alternative entry points when main is not specified', async () => {
    const analyzer = new DependencyAnalyzer();

    // Override readFile to return package.json without main field
    readFileImpl = async (filepath: any, _options?: any) => {
      const pathStr = filepath.toString();
      if (pathStr.endsWith('package.json')) {
        return JSON.stringify({
          name: 'test-mcp',
          version: '1.0.0',
          // No main field
        });
      }
      return '';
    };

    // Override stat to simulate index.js exists
    statImpl = async (filepath: any) => {
      const pathStr = filepath.toString();
      return {
        isFile: () => pathStr.endsWith('index.js'),
        isDirectory: () => false,
        size: 1024,
      };
    };

    // Use private method access for isolated testing
    const entryPoint = await (analyzer as any).detectEntryPoint(testDir);

    expect(entryPoint).toBe('index.js');
  });

  it('should analyze source imports and detect module formats', async () => {
    const analyzer = new DependencyAnalyzer();

    // Override readFileSyncImpl to NOT have type field, so file analysis is used
    readFileSyncImpl = (filepath: any): string | Buffer => {
      const pathStr = filepath.toString();
      if (pathStr.endsWith('package.json')) {
        return JSON.stringify({
          name: 'test-mcp',
          version: '1.0.0',
          main: 'index.js',
          // No "type" field - will trigger file analysis
        });
      }
      return '';
    };

    // Use private method access for isolated testing
    const { imports, format } = await (analyzer as any).analyzeSourceImports(testDir);

    expect(imports).toBeDefined();
    expect(imports.has('@modelcontextprotocol/sdk')).toBe(true);
    expect(imports.has('test-dependency')).toBe(true);
    expect(imports.has('react')).toBe(true); // From esm-module.js
    expect(imports.has('uuid')).toBe(true); // From esm-module.js

    // Note: The DependencyAnalyzer implementation also detects CommonJS requires
    // So fs, path, and axios from cjs-module.js would also be included
    expect(imports.has('axios')).toBe(true);

    // The format should be mixed since we have both ESM and CommonJS modules
    expect(format).toBe('mixed');
  });

  it('should analyze dependencies successfully', async () => {
    const analyzer = new DependencyAnalyzer();

    // Call the public analyzeDependencies method
    const result = await analyzer.analyzeDependencies(testDir);

    expect(result).toBeDefined();
    expect(result.declaredDependencies).toEqual({
      '@modelcontextprotocol/sdk': '^1.0.0',
      'test-dependency': '^2.0.0',
    });
    expect(result.entryPoint).toBe('index.js');
    expect(result.sourceImports).toBeDefined();
    // Format depends on package.json type field which defaults to 'module' in our mock
    expect(result.moduleFormat).toBe('esm');
  });

  it('should handle missing package.json gracefully', async () => {
    const analyzer = new DependencyAnalyzer();

    // Override readFile to throw for package.json
    readFileImpl = async (filepath: any, _options?: any) => {
      const pathStr = filepath.toString();
      if (pathStr.endsWith('package.json')) {
        throw new Error('ENOENT: no such file or directory');
      }
      return '';
    };

    // Override readFileSync to throw for package.json
    readFileSyncImpl = (filepath: any): string | Buffer => {
      const pathStr = filepath.toString();
      if (pathStr.endsWith('package.json')) {
        throw new Error('ENOENT: no such file or directory');
      }
      return '';
    };

    // Override stat to find index.js
    statImpl = async (filepath: any) => {
      const pathStr = filepath.toString();
      if (pathStr.endsWith('index.js')) {
        return { isFile: () => true, isDirectory: () => false, size: 1024 };
      }
      throw new Error('ENOENT');
    };

    // Use private method access for isolated testing
    const deps = await (analyzer as any).getDeclaredDependencies(testDir);

    // Should return empty object when package.json is missing
    expect(deps).toEqual({});
  });

  it('should extract package name correctly from import paths', () => {
    const analyzer = new DependencyAnalyzer();

    // Test scoped packages
    expect((analyzer as any).getPackageName('@modelcontextprotocol/sdk')).toBe(
      '@modelcontextprotocol/sdk',
    );
    expect((analyzer as any).getPackageName('@modelcontextprotocol/sdk/subpath')).toBe(
      '@modelcontextprotocol/sdk',
    );

    // Test normal packages
    expect((analyzer as any).getPackageName('react')).toBe('react');
    expect((analyzer as any).getPackageName('react/jsx-runtime')).toBe('react');

    // Test packages with subpaths
    expect((analyzer as any).getPackageName('lodash/debounce')).toBe('lodash');
    expect((analyzer as any).getPackageName('@babel/core/something')).toBe('@babel/core');
  });

  it('should detect pure ESM format', async () => {
    const analyzer = new DependencyAnalyzer();

    // Override readFileSyncImpl to NOT have type field, so file analysis is used
    readFileSyncImpl = (filepath: any): string | Buffer => {
      const pathStr = filepath.toString();
      if (pathStr.endsWith('package.json')) {
        return JSON.stringify({
          name: 'test-mcp',
          version: '1.0.0',
          main: 'index.js',
          // No "type" field - will trigger file analysis
        });
      }
      return '';
    };

    // Override readdirImpl to only return ESM files
    readdirImpl = async (dirPath: any, options?: any) => {
      const pathStr = dirPath.toString();
      const withFileTypes = options?.withFileTypes === true;

      if (pathStr === testPaths.testRepoPath) {
        if (withFileTypes) {
          return [
            { name: 'index.js', isDirectory: () => false },
            { name: 'package.json', isDirectory: () => false },
            { name: 'src', isDirectory: () => true },
          ];
        }
        return ['index.js', 'package.json', 'src'];
      }

      if (pathStr === path.join(testPaths.testRepoPath, 'src')) {
        if (withFileTypes) {
          return [
            { name: 'utils.js', isDirectory: () => false },
            { name: 'components', isDirectory: () => true },
          ];
        }
        return ['utils.js', 'components'];
      }

      if (pathStr === path.join(testPaths.testRepoPath, 'src', 'components')) {
        if (withFileTypes) {
          return [{ name: 'esm-module.js', isDirectory: () => false }];
        }
        return ['esm-module.js'];
      }

      return [];
    };

    // Call analyzeSourceImports
    const { format } = await (analyzer as any).analyzeSourceImports(testDir);

    // Should detect pure ESM format
    expect(format).toBe('esm');
  });

  it('should detect pure CommonJS format', async () => {
    const analyzer = new DependencyAnalyzer();

    // Override readFileSyncImpl to NOT have type field, so file analysis is used
    readFileSyncImpl = (filepath: any): string | Buffer => {
      const pathStr = filepath.toString();
      if (pathStr.endsWith('package.json')) {
        return JSON.stringify({
          name: 'test-mcp',
          version: '1.0.0',
          main: 'index.js',
          // No "type" field - will trigger file analysis
        });
      }
      return '';
    };

    // Override readdirImpl to only return CommonJS files
    readdirImpl = async (dirPath: any, options?: any) => {
      const pathStr = dirPath.toString();
      const withFileTypes = options?.withFileTypes === true;

      if (pathStr === testPaths.testRepoPath) {
        if (withFileTypes) {
          return [
            { name: 'index.js', isDirectory: () => false },
            { name: 'package.json', isDirectory: () => false },
            { name: 'src', isDirectory: () => true },
          ];
        }
        return ['index.js', 'package.json', 'src'];
      }

      if (pathStr === path.join(testPaths.testRepoPath, 'src')) {
        if (withFileTypes) {
          return [
            { name: 'utils.js', isDirectory: () => false },
            { name: 'components', isDirectory: () => true },
          ];
        }
        return ['utils.js', 'components'];
      }

      if (pathStr === path.join(testPaths.testRepoPath, 'src', 'components')) {
        if (withFileTypes) {
          return [{ name: 'cjs-module.js', isDirectory: () => false }];
        }
        return ['cjs-module.js'];
      }

      return [];
    };

    // Override readFileImpl to ensure only CJS files are parsed
    readFileImpl = async (filepath: any) => {
      const pathStr = filepath.toString();
      if (pathStr.endsWith('package.json')) {
        return JSON.stringify({
          name: 'test-mcp',
          version: '1.0.0',
          main: 'index.js',
          dependencies: {
            fs: '^1.0.0',
            path: '^1.0.0',
          },
        });
      }
      if (pathStr.endsWith('cjs-module.js')) {
        return `
          const fs = require('fs');
          const path = require('path');
          const axios = require('axios');

          function readConfig() {
            const config = fs.readFileSync(path.join(__dirname, 'config.json'));
            return JSON.parse(config);
          }

          module.exports = { readConfig };
        `;
      }
      return '';
    };

    // Call analyzeSourceImports
    const { format } = await (analyzer as any).analyzeSourceImports(testDir);

    // Should detect CommonJS format
    expect(format).toBe('commonjs');
  });

  it('should handle exports object in package.json for entry point detection', async () => {
    const analyzer = new DependencyAnalyzer();

    // Override readFileImpl for this specific test
    readFileImpl = async (filepath: any) => {
      const pathStr = filepath.toString();
      if (pathStr.endsWith('package.json')) {
        return JSON.stringify({
          name: 'test-mcp',
          version: '1.0.0',
          exports: {
            '.': './dist/index.js',
            './utils': './dist/utils.js',
          },
          dependencies: {
            '@modelcontextprotocol/sdk': '^1.0.0',
          },
        });
      }
      return '';
    };

    // Use private method access for isolated testing
    const entryPoint = await (analyzer as any).detectEntryPoint(testDir);

    // Should detect the entry point from the exports field
    expect(entryPoint).toBe('./dist/index.js');
  });
});
