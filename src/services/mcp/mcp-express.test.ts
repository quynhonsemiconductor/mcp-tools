import { beforeEach, describe, expect, it, mock } from 'bun:test';

// The SDK's express helper is the only thing mcp-express.ts needs from the
// network stack. mock.module is used here (rather than spyOn) because the
// target is an ESM export from node_modules, whose namespace object is not
// writable. This mock is contained: mcp-express.ts is the sole importer of
// sdk/server/express.js, and the only other test that touches mcp-express
// (commands/server.test.ts) replaces that module wholesale.
const mockListen = mock((..._args: any[]) => ({ close: mock(() => {}) }));
const mockPost = mock(() => {});
const mockGet = mock(() => {});
const mockDelete = mock(() => {});
const mockApp = {
  post: mockPost,
  get: mockGet,
  delete: mockDelete,
  listen: mockListen,
};
const mockCreateMcpExpressApp = mock((_opts: any) => mockApp);
void mock.module('@modelcontextprotocol/sdk/server/express.js', () => ({
  createMcpExpressApp: mockCreateMcpExpressApp,
}));

const { DEFAULT_MCP_ENDPOINT, DEFAULT_MCP_HOST, ExpressStatefulMcpServer } =
  await import('./mcp-express');

const serverFactory = () => Promise.resolve({} as any);

describe('ExpressStatefulMcpServer', () => {
  beforeEach(() => {
    mockListen.mockClear();
    mockPost.mockClear();
    mockGet.mockClear();
    mockDelete.mockClear();
    mockCreateMcpExpressApp.mockClear();
  });

  describe('host binding', () => {
    it('should bind the loopback interface by default', () => {
      new ExpressStatefulMcpServer(serverFactory, { port: 8081 }).start();

      expect(mockListen).toHaveBeenCalledWith(8081, '127.0.0.1', expect.any(Function));
    });

    it('should pass an explicit host through to listen', () => {
      new ExpressStatefulMcpServer(serverFactory, {
        port: 9000,
        host: '0.0.0.0',
      }).start();

      expect(mockListen).toHaveBeenCalledWith(9000, '0.0.0.0', expect.any(Function));
    });

    it('should give the SDK the same host it binds, so rebinding protection cannot diverge', () => {
      new ExpressStatefulMcpServer(serverFactory, { port: 8081 }).start();

      expect(mockCreateMcpExpressApp).toHaveBeenCalledWith({
        host: DEFAULT_MCP_HOST,
      });
      expect(mockListen).toHaveBeenCalledWith(8081, DEFAULT_MCP_HOST, expect.any(Function));
    });

    it('should export a loopback default host', () => {
      expect(DEFAULT_MCP_HOST).toBe('127.0.0.1');
    });
  });

  describe('route registration', () => {
    it('should register all three routes at /mcp by default', () => {
      new ExpressStatefulMcpServer(serverFactory, { port: 8081 }).start();

      expect(mockPost).toHaveBeenCalledWith('/mcp', expect.any(Function));
      expect(mockGet).toHaveBeenCalledWith('/mcp', expect.any(Function));
      expect(mockDelete).toHaveBeenCalledWith('/mcp', expect.any(Function));
    });

    it('should register all three routes at a configured endpoint', () => {
      new ExpressStatefulMcpServer(serverFactory, {
        port: 8081,
        endpoint: '/custom-endpoint',
      }).start();

      expect(mockPost).toHaveBeenCalledWith('/custom-endpoint', expect.any(Function));
      expect(mockGet).toHaveBeenCalledWith('/custom-endpoint', expect.any(Function));
      expect(mockDelete).toHaveBeenCalledWith('/custom-endpoint', expect.any(Function));
      expect(mockPost).not.toHaveBeenCalledWith('/mcp', expect.any(Function));
    });

    it('should export a /mcp default endpoint', () => {
      expect(DEFAULT_MCP_ENDPOINT).toBe('/mcp');
    });
  });

  it('should refuse to start twice', () => {
    const server = new ExpressStatefulMcpServer(serverFactory, { port: 8081 });
    server.start();

    try {
      server.start();
      throw new Error('Expected start() to throw when already started');
    } catch (error: any) {
      expect(error.message).toBe('MCP Express server is already started');
    }
  });
});
