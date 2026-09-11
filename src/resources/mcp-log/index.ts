import { YAML } from 'bun';
import { readdir } from 'node:fs/promises';
import path from 'path';
import { loadConfig } from '../../config';
import { Resource } from '../../registry/resources';
import { ResourceHandler } from '../../registry/resources/types';
import { LOG_DIR, LOG_FILE } from '../../services/logger';
import { CatchErrors } from '../../utils';

/**
 * mcp server log - View the mcp server log (if there is one)
 */
@Resource({
  id: 'mcp-current-log',
  name: 'mcp server current log',
  description: 'View the current mcp server log (if there is one)',
  category: 'Log',
})
export class McpCurrentLogResource implements ResourceHandler {
  /**
   * Load the resource content
   */
  @CatchErrors()
  async load(_args: unknown): Promise<string> {
    const fileContent = await Bun.file(LOG_FILE).text();
    if (!fileContent) {
      return `No content found in the MCP log file: ${LOG_FILE}`;
    }
    return `Log file content from ${LOG_FILE}:\n\n${fileContent}`;
  }
}

/**
 * mcp server log - View the mcp server log (if there is one)
 */
@Resource({
  id: 'mcp-log',
  name: 'mcp server log',
  description: 'View the a specific mcp server log (if there is one)',
  category: 'Log',
  arguments: [
    {
      name: 'log_file',
      description: 'File name of the MCP log file to view',
      required: true,
      complete: async (_value: string) => {
        // Provide completion for log file names
        // read all the files in the log directory
        const files = await readdir(LOG_DIR);
        return {
          values: files,
          hasMore: false,
          total: files.length,
        };
      },
    },
  ],
})
export class McpLogResource implements ResourceHandler {
  /**
   * Load the resource content
   */
  @CatchErrors()
  async load(args: unknown): Promise<string> {
    // Resolved template variables arrive as the first argument; narrow before use.
    const logFileName =
      typeof args === 'object' &&
      args !== null &&
      'log_file' in args &&
      typeof (args as Record<string, unknown>).log_file === 'string'
        ? (args as Record<string, string>).log_file
        : '';
    const logFile = path.join(LOG_DIR, logFileName);
    const fileContent = await Bun.file(logFile).text();
    if (!fileContent) {
      return `No content found in the MCP log file: ${logFile}`;
    }
    return `Log file content from ${logFile}:\n\n${fileContent}`;
  }
}

@Resource({
  id: 'mcp-current-config',
  name: 'mcp current configuration',
  description: 'View the current MCP configuration',
  category: 'Configuration',
})
export class McpCurrentConfig implements ResourceHandler {
  /**
   * Load the resource content
   */
  @CatchErrors()
  // eslint-disable-next-line @typescript-eslint/require-await -- implements a Promise-returning interface; async is required by the contract even without an await
  async load(_args: unknown): Promise<string> {
    const config = loadConfig();
    return YAML.stringify(config, null, 2);
  }
}
