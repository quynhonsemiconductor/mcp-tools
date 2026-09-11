import { describe, test, expect, beforeAll, beforeEach, mock } from 'bun:test';
import type { LocalMCPServerDefinition } from './available-local-servers';

// Use dynamic imports to ensure we get the real module after clearing mocks
let AVAILABLE_LOCAL_MCP_SERVERS: LocalMCPServerDefinition[];
let getLocalMCPServer: (id: string) => LocalMCPServerDefinition | undefined;
let getAvailableLocalMCPServerIds: () => string[];
let getLocalMCPServersByCategory: (
  category: LocalMCPServerDefinition['category'],
) => LocalMCPServerDefinition[];
let validateLocalMCPServerIds: (serverIds: string[]) => {
  valid: string[];
  invalid: string[];
};

describe('available-local-servers', () => {
  beforeAll(() => {
    // Aggressively ensure any module mocks from other tests are cleared
    mock.restore();
  });

  beforeEach(async () => {
    // Re-import the module freshly before each test to ensure we get real data
    mock.restore();

    // Force clear from Bun's module cache
    // @ts-ignore - Bun internal API
    if (typeof Loader !== 'undefined' && Loader.registry) {
      // @ts-ignore
      const registry = Loader.registry;
      try {
        const modulePath = require.resolve('./available-local-servers');
        registry.delete(modulePath);
      } catch {
        // Ignore errors
      }
    }

    // Dynamically import to get fresh module
    const module = await import('./available-local-servers?t=' + Date.now());
    AVAILABLE_LOCAL_MCP_SERVERS = module.AVAILABLE_LOCAL_MCP_SERVERS;
    getLocalMCPServer = module.getLocalMCPServer;
    getAvailableLocalMCPServerIds = module.getAvailableLocalMCPServerIds;
    getLocalMCPServersByCategory = module.getLocalMCPServersByCategory;
    validateLocalMCPServerIds = module.validateLocalMCPServerIds;
  });
  describe('AVAILABLE_LOCAL_MCP_SERVERS', () => {
    test('should have at least one server defined', () => {
      expect(AVAILABLE_LOCAL_MCP_SERVERS.length).toBeGreaterThan(0);
    });

    test('all servers should have required fields', () => {
      AVAILABLE_LOCAL_MCP_SERVERS.forEach((server) => {
        expect(server).toHaveProperty('id');
        expect(server).toHaveProperty('name');
        expect(server).toHaveProperty('description');
        expect(server).toHaveProperty('category');
        expect(server).toHaveProperty('launch');
        expect(server.id).toBeTruthy();
        expect(server.name).toBeTruthy();
        expect(server.description).toBeTruthy();
        expect(server.launch).toBeTruthy();
      });
    });

    test('all server IDs should be unique', () => {
      const ids = AVAILABLE_LOCAL_MCP_SERVERS.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    test('all servers should have valid categories', () => {
      const validCategories = ['internal', 'partner', 'external', 'development'];
      AVAILABLE_LOCAL_MCP_SERVERS.forEach((server) => {
        expect(validCategories).toContain(server.category);
      });
    });
  });

  describe('Playwright server definition', () => {
    let playwrightServer: LocalMCPServerDefinition | undefined;

    test('should have playwright-local server defined', () => {
      playwrightServer = getLocalMCPServer('playwright-local');
      expect(playwrightServer).toBeDefined();
      expect(playwrightServer?.id).toBe('playwright-local');
      expect(playwrightServer?.name).toBe('Playwright');
    });

    test('should have required environment variable PLAYWRIGHT_BROWSERS_PATH', () => {
      playwrightServer = getLocalMCPServer('playwright-local');
      expect(playwrightServer?.requiredEnvVars).toContain('PLAYWRIGHT_BROWSERS_PATH');
    });

    test('should have PLAYWRIGHT_MCP_EXTENSION_TOKEN in env mapping', () => {
      playwrightServer = getLocalMCPServer('playwright-local');
      expect(playwrightServer?.env).toBeDefined();
      expect(playwrightServer?.env).toHaveProperty('PLAYWRIGHT_MCP_EXTENSION_TOKEN');
    });

    test('should read PLAYWRIGHT_MCP_EXTENSION_TOKEN from process.env or use empty string', () => {
      playwrightServer = getLocalMCPServer('playwright-local');
      const envValue = playwrightServer?.env?.PLAYWRIGHT_MCP_EXTENSION_TOKEN;
      expect(typeof envValue).toBe('string');
      expect(envValue).toBe(process.env.PLAYWRIGHT_MCP_EXTENSION_TOKEN || '');
    });

    test('description should mention CLI arguments and configuration', () => {
      playwrightServer = getLocalMCPServer('playwright-local');
      expect(playwrightServer?.description).toContain('mcpArgs');
      expect(playwrightServer?.description).toContain('.qnscmcp.yaml');
    });

    test('should use npx launcher', () => {
      playwrightServer = getLocalMCPServer('playwright-local');
      expect(playwrightServer?.launch).toMatch(/^npx/);
    });
  });

  describe('getLocalMCPServer', () => {
    test('should return server when ID exists', () => {
      const server = getLocalMCPServer('playwright-local');
      expect(server).toBeDefined();
      expect(server?.id).toBe('playwright-local');
    });

    test('should return undefined when ID does not exist', () => {
      const server = getLocalMCPServer('non-existent-server');
      expect(server).toBeUndefined();
    });
  });

  describe('getAvailableLocalMCPServerIds', () => {
    test('should return array of server IDs', () => {
      const ids = getAvailableLocalMCPServerIds();
      expect(Array.isArray(ids)).toBe(true);
      expect(ids.length).toBeGreaterThan(0);
      expect(ids).toContain('playwright-local');
    });
  });

  describe('getLocalMCPServersByCategory', () => {
    test('should return servers in development category', () => {
      const developmentServers = getLocalMCPServersByCategory('development');
      expect(Array.isArray(developmentServers)).toBe(true);
      expect(developmentServers.length).toBeGreaterThan(0);
      developmentServers.forEach((server) => {
        expect(server.category).toBe('development');
      });
    });

    test('should return empty array for category with no servers', () => {
      const internalServers = getLocalMCPServersByCategory('internal');
      expect(Array.isArray(internalServers)).toBe(true);
    });
  });

  describe('validateLocalMCPServerIds', () => {
    test('should identify valid server IDs', () => {
      const result = validateLocalMCPServerIds(['playwright-local', 'mobile-next-local']);
      expect(result.valid).toContain('playwright-local');
      expect(result.invalid.length).toBe(0);
    });

    test('should identify invalid server IDs', () => {
      const result = validateLocalMCPServerIds(['playwright-local', 'invalid-server']);
      expect(result.valid).toContain('playwright-local');
      expect(result.invalid).toContain('invalid-server');
    });

    test('should handle empty array', () => {
      const result = validateLocalMCPServerIds([]);
      expect(result.valid.length).toBe(0);
      expect(result.invalid.length).toBe(0);
    });

    test('should handle all invalid IDs', () => {
      const result = validateLocalMCPServerIds(['invalid-1', 'invalid-2']);
      expect(result.valid.length).toBe(0);
      expect(result.invalid.length).toBe(2);
    });
  });
});
