import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUIDv7 } from 'bun';
import type { Express, Request, Response } from 'express';
import { Server } from 'http';
import { InMemoryEventStore } from './in-memory-event-store';
import { logError, logInfo } from '../logger';
/** Interface the HTTP Stream transport binds to when no host is configured. */
export const DEFAULT_MCP_HOST = '127.0.0.1';

/** Path the HTTP Stream transport serves when no endpoint is configured. */
export const DEFAULT_MCP_ENDPOINT = '/mcp';

export type ExpressMcpServerConfig = {
  port: number;
  host?: string;
  endpoint?: string;
  stateful?: boolean;
};

export type McpServerFactory = () => Promise<McpServer>;
export interface Closable {
  close(cb: (err?: Error) => void): void;
}

export class ExpressStatefulMcpServer {
  private _transports: Record<string, StreamableHTTPServerTransport> = {};
  private _app: Express | undefined;
  private _server: Server | undefined;
  constructor(
    private _mcpServerFactory: McpServerFactory,
    private _config: ExpressMcpServerConfig,
  ) {}

  start() {
    if (this._app) {
      throw new Error('MCP Express server is already started');
    }
    const { port, host = DEFAULT_MCP_HOST, endpoint = DEFAULT_MCP_ENDPOINT } = this._config;
    // Resolve the default here rather than letting createMcpExpressApp apply its
    // own, so the address we bind and the address the SDK uses for its DNS
    // rebinding check can never diverge.
    this._app = createMcpExpressApp({
      host,
    });

    this._app.post(endpoint, this.mcpPostHandler.bind(this));
    this._app.get(endpoint, this.mcpGetHandler.bind(this));
    this._app.delete(endpoint, this.mcpDeleteHandler.bind(this));

    this._server = this._app.listen(port, host, () => {
      logInfo(`MCP Express server listening on ${host}:${port}${endpoint}`);
    });
  }

  async mcpPostHandler(req: Request, res: Response) {
    const sessionId: string | undefined = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId && !(sessionId in this._transports)) {
      res.status(404).json({ error: 'Session ID not found' });
      return;
    }
    if (!sessionId) {
      if (isInitializeRequest(req.body)) {
        // Create a new transport for this session
        const eventStorage = new InMemoryEventStore();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: randomUUIDv7,
          eventStore: eventStorage,
          onsessioninitialized: (sessionId) => {
            this._transports[sessionId] = transport;
          },
        });
        transport.onclose = () => {
          const sessionId = transport.sessionId;
          if (sessionId && sessionId in this._transports) {
            delete this._transports[sessionId];
          }
        };
        const server = await this._mcpServerFactory();
        await server.connect(transport);
        transport.onerror = (error) => {
          logError(`Error in transport for session ${transport.sessionId}`, { error });
        };

        await transport.handleRequest(req, res, req.body);
        return;
      }
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: Missing MCP Session ID',
        },
        id: null,
      });
      return;
    }
    const transport = this._transports[sessionId];
    await transport.handleRequest(req, res, req.body);
  }

  async mcpGetHandler(req: Request, res: Response) {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !(sessionId in this._transports)) {
      res.status(404).json({ error: 'Session ID not found' });
      return;
    }

    const transport = this._transports[sessionId];
    await transport.handleRequest(req, res);
  }

  async mcpDeleteHandler(req: Request, res: Response) {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !(sessionId in this._transports)) {
      res.status(404).json({ error: 'Session ID not found' });
      return;
    }
    const transport = this._transports[sessionId];
    await transport.handleRequest(req, res);
  }

  async shutdown() {
    for (const sessionId in this._transports) {
      const transport = this._transports[sessionId];
      transport.onclose = undefined;
      await transport.close();
      delete this._transports[sessionId];
    }
    await new Promise<void>((resolve, reject) => {
      this._server?.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
    this._server = undefined;
    this._app = undefined;
  }
}
