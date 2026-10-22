/**
 * ConfigGenerator.test.ts - Unit tests for ConfigGenerator
 *
 * Tests the collectEnvironmentVariables logic to ensure environment variables
 * are correctly collected based on tool inclusion/exclusion settings.
 *
 * Regression test for issue #748: Config file generation for Claude Code (etc)
 * does not include parameters for all necessary secrets when tools are
 * explicitly included via the `include` list.
 */

import { describe, expect, test } from 'bun:test';
import { ConfigGenerator } from './ConfigGenerator.js';

/**
 * Mock StateManager for testing ConfigGenerator
 */
class MockStateManager {
  private mcps: any[];
  private currentConfig: any;

  constructor(mcps: any[] = [], config: any = {}) {
    this.mcps = mcps;
    this.currentConfig = {
      tools: {
        include: [],
        exclude: [],
        includeCategories: [],
        excludeCategories: [],
        includeMCPs: [],
        includeRemoteMCPs: [],
        includeLocalMCPs: [],
        ...config.tools
      },
      logging: config.logging || {
        enabled: true,
        level: 'info',
        maxSize: 5,
        maxFiles: 5
      },
      ...config
    };
  }

  getMcps() {
    return this.mcps;
  }

  getCurrentConfig() {
    return this.currentConfig;
  }
}

/**
 * Helper to create a native MCP with tools
 */
function createNativeMCP(
  name: string,
  tools: Array<{ id: string; category: string }>,
  envVars: Array<{ key: string; description?: string; required?: boolean }>
) {
  return {
    provider: 'native',
    name,
    tools: tools.map((t) => ({ ...t, envVars: envVars.map((e) => e.key) })),
    envVars
  };
}

describe('ConfigGenerator', () => {
  describe('collectEnvironmentVariables', () => {
    describe('explicit tool inclusion (issue #748)', () => {
      test('should include env vars for tools in the include list', () => {
        // This is the main regression test for issue #748
        // When a tool is explicitly included via include: ['tool-id'],
        // its environment variables should be collected
        const mcps = [
          createNativeMCP(
            'k6 Tools',
            [
              { id: 'create-k6-defect', category: 'k6' },
              { id: 'get-k6-item', category: 'k6' }
            ],
            [{ key: 'GRAFANA_K6_TOKEN', description: 'k6 API key', required: true }]
          )
        ];

        const stateManager = new MockStateManager(mcps, {
          tools: {
            include: ['create-k6-defect'], // Explicitly include one k6 tool
            includeCategories: [] // No categories included
          }
        });

        const generator = new ConfigGenerator(stateManager);
        const envVars = generator.collectEnvironmentVariables();

        expect(envVars.some((v: any) => v.name === 'GRAFANA_K6_TOKEN')).toBe(true);
      });

      test('should include env vars for multiple explicitly included tools from different MCPs', () => {
        const mcps = [
          createNativeMCP(
            'k6 Tools',
            [{ id: 'create-k6-defect', category: 'k6' }],
            [{ key: 'GRAFANA_K6_TOKEN', description: 'k6 API key', required: true }]
          ),
          createNativeMCP(
            'SLED Tools',
            [{ id: 'sled', category: 'QNSC Internal' }],
            [{ key: 'SLED_API_KEY', description: 'SLED API key', required: true }]
          )
        ];

        const stateManager = new MockStateManager(mcps, {
          tools: {
            include: ['create-k6-defect', 'sled'],
            includeCategories: []
          }
        });

        const generator = new ConfigGenerator(stateManager);
        const envVars = generator.collectEnvironmentVariables();

        expect(envVars.some((v: any) => v.name === 'GRAFANA_K6_TOKEN')).toBe(true);
        expect(envVars.some((v: any) => v.name === 'SLED_API_KEY')).toBe(true);
      });
    });

    describe('category-based inclusion', () => {
      test('should include env vars for tools in includeCategories', () => {
        const mcps = [
          createNativeMCP(
            'GitHub Tools',
            [{ id: 'github-create-pr', category: 'GitHub' }],
            [{ key: 'GITHUB_TOKEN', description: 'GitHub token', required: false }]
          )
        ];

        const stateManager = new MockStateManager(mcps, {
          tools: {
            includeCategories: ['GitHub']
          }
        });

        const generator = new ConfigGenerator(stateManager);
        const envVars = generator.collectEnvironmentVariables();

        expect(envVars.some((v: any) => v.name === 'GITHUB_TOKEN')).toBe(true);
      });

      test('should include env vars when both include and includeCategories are used', () => {
        const mcps = [
          createNativeMCP(
            'k6 Tools',
            [{ id: 'create-k6-defect', category: 'k6' }],
            [{ key: 'GRAFANA_K6_TOKEN', description: 'k6 API key', required: true }]
          ),
          createNativeMCP(
            'GitHub Tools',
            [{ id: 'github-create-pr', category: 'GitHub' }],
            [{ key: 'GITHUB_TOKEN', description: 'GitHub token', required: false }]
          )
        ];

        const stateManager = new MockStateManager(mcps, {
          tools: {
            include: ['create-k6-defect'], // k6 tool via explicit include
            includeCategories: ['GitHub'] // GitHub tools via category
          }
        });

        const generator = new ConfigGenerator(stateManager);
        const envVars = generator.collectEnvironmentVariables();

        // Both should be included
        expect(envVars.some((v: any) => v.name === 'GRAFANA_K6_TOKEN')).toBe(true);
        expect(envVars.some((v: any) => v.name === 'GITHUB_TOKEN')).toBe(true);
      });
    });

    describe('exclusion handling', () => {
      test('should not include env vars for explicitly excluded tools', () => {
        const mcps = [
          createNativeMCP(
            'k6 Tools',
            [{ id: 'create-k6-defect', category: 'k6' }],
            [{ key: 'GRAFANA_K6_TOKEN', description: 'k6 API key', required: true }]
          )
        ];

        const stateManager = new MockStateManager(mcps, {
          tools: {
            include: ['create-k6-defect'],
            exclude: ['create-k6-defect'] // Exclusion should take precedence
          }
        });

        const generator = new ConfigGenerator(stateManager);
        const envVars = generator.collectEnvironmentVariables();

        expect(envVars.some((v: any) => v.name === 'GRAFANA_K6_TOKEN')).toBe(false);
      });

      test('should not include env vars for tools in excludeCategories', () => {
        const mcps = [
          createNativeMCP(
            'k6 Tools',
            [{ id: 'create-k6-defect', category: 'k6' }],
            [{ key: 'GRAFANA_K6_TOKEN', description: 'k6 API key', required: true }]
          )
        ];

        const stateManager = new MockStateManager(mcps, {
          tools: {
            include: ['create-k6-defect'],
            excludeCategories: ['k6'] // Category exclusion takes precedence
          }
        });

        const generator = new ConfigGenerator(stateManager);
        const envVars = generator.collectEnvironmentVariables();

        expect(envVars.some((v: any) => v.name === 'GRAFANA_K6_TOKEN')).toBe(false);
      });

      test('exclusions should take precedence over inclusions', () => {
        const mcps = [
          createNativeMCP(
            'k6 Tools',
            [
              { id: 'create-k6-defect', category: 'k6' },
              { id: 'get-k6-item', category: 'k6' }
            ],
            [{ key: 'GRAFANA_K6_TOKEN', description: 'k6 API key', required: true }]
          )
        ];

        const stateManager = new MockStateManager(mcps, {
          tools: {
            includeCategories: ['k6'], // Include all k6 tools
            exclude: ['create-k6-defect', 'get-k6-item'] // But exclude both
          }
        });

        const generator = new ConfigGenerator(stateManager);
        const envVars = generator.collectEnvironmentVariables();

        // No k6 env vars should be included since all tools are excluded
        expect(envVars.some((v: any) => v.name === 'GRAFANA_K6_TOKEN')).toBe(false);
      });
    });

    describe('default behavior', () => {
      test('should include all tools when no filters are specified', () => {
        const mcps = [
          createNativeMCP(
            'k6 Tools',
            [{ id: 'create-k6-defect', category: 'k6' }],
            [{ key: 'GRAFANA_K6_TOKEN', description: 'k6 API key', required: true }]
          ),
          createNativeMCP(
            'GitHub Tools',
            [{ id: 'github-create-pr', category: 'GitHub' }],
            [{ key: 'GITHUB_TOKEN', description: 'GitHub token', required: false }]
          )
        ];

        const stateManager = new MockStateManager(mcps, {
          tools: {
            // No include, exclude, or category filters
          }
        });

        const generator = new ConfigGenerator(stateManager);
        const envVars = generator.collectEnvironmentVariables();

        // All env vars should be included by default
        expect(envVars.some((v: any) => v.name === 'GRAFANA_K6_TOKEN')).toBe(true);
        expect(envVars.some((v: any) => v.name === 'GITHUB_TOKEN')).toBe(true);
      });
    });

    describe('bundled MCP handling', () => {
      test('should include env vars for bundled MCPs in includeMCPs', () => {
        const mcps = [
          {
            provider: 'bundled',
            name: 'figma',
            envVars: [{ key: 'FIGMA_TOKEN', description: 'Figma API token', required: true }]
          }
        ];

        const stateManager = new MockStateManager(mcps, {
          tools: {
            includeMCPs: ['figma']
          }
        });

        const generator = new ConfigGenerator(stateManager);
        const envVars = generator.collectEnvironmentVariables();

        expect(envVars.some((v: any) => v.name === 'FIGMA_TOKEN')).toBe(true);
      });

      test('should not include env vars for bundled MCPs not in includeMCPs', () => {
        const mcps = [
          {
            provider: 'bundled',
            name: 'figma',
            envVars: [{ key: 'FIGMA_TOKEN', description: 'Figma API token', required: true }]
          }
        ];

        const stateManager = new MockStateManager(mcps, {
          tools: {
            includeMCPs: ['confluence'] // Different MCP
          }
        });

        const generator = new ConfigGenerator(stateManager);
        const envVars = generator.collectEnvironmentVariables();

        expect(envVars.some((v: any) => v.name === 'FIGMA_TOKEN')).toBe(false);
      });
    });

    describe('remote and local MCP handling', () => {
      test('should include env vars for remote MCPs in includeRemoteMCPs', () => {
        const mcps = [
          {
            provider: 'remote',
            id: 'custom-remote',
            name: 'Custom Remote MCP',
            envVars: [{ key: 'REMOTE_API_KEY', description: 'Remote API key', required: true }]
          }
        ];

        const stateManager = new MockStateManager(mcps, {
          tools: {
            includeRemoteMCPs: ['custom-remote']
          }
        });

        const generator = new ConfigGenerator(stateManager);
        const envVars = generator.collectEnvironmentVariables();

        expect(envVars.some((v: any) => v.name === 'REMOTE_API_KEY')).toBe(true);
      });

      test('should include env vars for local MCPs in includeLocalMCPs', () => {
        const mcps = [
          {
            provider: 'local',
            id: 'custom-local',
            name: 'Custom Local MCP',
            envVars: [{ key: 'LOCAL_API_KEY', description: 'Local API key', required: true }]
          }
        ];

        const stateManager = new MockStateManager(mcps, {
          tools: {
            includeLocalMCPs: ['custom-local']
          }
        });

        const generator = new ConfigGenerator(stateManager);
        const envVars = generator.collectEnvironmentVariables();

        expect(envVars.some((v: any) => v.name === 'LOCAL_API_KEY')).toBe(true);
      });
    });

    describe('required field handling', () => {
      test('should preserve required: false for optional env vars', () => {
        const mcps = [
          createNativeMCP(
            'GitHub Tools',
            [{ id: 'github-create-pr', category: 'GitHub' }],
            [{ key: 'GITHUB_TOKEN', description: 'GitHub token', required: false }]
          )
        ];

        const stateManager = new MockStateManager(mcps, {
          tools: {
            includeCategories: ['GitHub']
          }
        });

        const generator = new ConfigGenerator(stateManager);
        const envVars = generator.collectEnvironmentVariables();

        const githubToken = envVars.find((v: any) => v.name === 'GITHUB_TOKEN');
        expect(githubToken).toBeDefined();
        expect((githubToken as any).required).toBe(false);
      });

      test('should default to required: true when not specified', () => {
        const mcps = [
          {
            provider: 'native',
            name: 'Test Tools',
            tools: [{ id: 'test-tool', category: 'Test' }],
            envVars: [{ key: 'TEST_KEY' }] // No required field
          }
        ];

        const stateManager = new MockStateManager(mcps, {
          tools: {
            includeCategories: ['Test']
          }
        });

        const generator = new ConfigGenerator(stateManager);
        const envVars = generator.collectEnvironmentVariables();

        const testKey = envVars.find((v: any) => v.name === 'TEST_KEY');
        expect(testKey).toBeDefined();
        expect((testKey as any).required).toBe(true);
      });
    });

    describe('deduplication', () => {
      test('should deduplicate env vars when multiple tools use the same key', () => {
        const mcps = [
          createNativeMCP(
            'k6 Tools',
            [
              { id: 'create-k6-defect', category: 'k6' },
              { id: 'get-k6-item', category: 'k6' },
              { id: 'update-k6-story', category: 'k6' }
            ],
            [{ key: 'GRAFANA_K6_TOKEN', description: 'k6 API key', required: true }]
          )
        ];

        const stateManager = new MockStateManager(mcps, {
          tools: {
            includeCategories: ['k6']
          }
        });

        const generator = new ConfigGenerator(stateManager);
        const envVars = generator.collectEnvironmentVariables();

        // Should only have one GRAFANA_K6_TOKEN, not three
        const serviceKeys = envVars.filter((v: any) => v.name === 'GRAFANA_K6_TOKEN');
        expect(serviceKeys.length).toBe(1);
      });
    });
  });
});
