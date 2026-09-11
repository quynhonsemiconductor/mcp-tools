import yargs from 'yargs';
import {
  doctor,
  generateConfig,
  getPrompt,
  install,
  listBundledMCPs,
  listLocalMCPs,
  listPrompts,
  listResources,
  listTools,
  logout,
  reauth,
  startServer,
  startWebServer,
  update,
  viewLogs,
} from './commands';
import { listRemoteMCPs } from './commands/remote-mcp';
import { loadConfig } from './config';
import { displayError, displayHeader } from './lib/display';
import { checkUpdateResult, cleanupOldBinaryBackups } from './utils/update-utils';

/**
 * Main entry point for the QNSC MCP CLI
 */
export async function main(): Promise<void> {
  // Clean up old binary backups from previous updates (Windows only)
  cleanupOldBinaryBackups();

  // Check for update result from background update script (Windows only)
  // Note: This is now mostly for telemetry/logging purposes since we use
  // synchronous rename-then-replace approach
  checkUpdateResult();

  let version: string;
  try {
    version = require('../package.json').version;
  } catch {
    version = 'unknown';
  }

  const parser = yargs(process.argv.slice(2))
    .scriptName('qnsc-mcp')
    .usage('Usage: $0 [command] [options]\n\nNo args needed for stdio transport.')
    .command(
      ['web'],
      'Start the web server',
      { port: { type: 'number', default: 5678 } },
      async (argv) => {
        // Pass configuration path to initialize config system properly
        if (argv.config) {
          process.argv.push('--config', argv.config as string);
        }
        await startWebServer(argv.port);
      },
    )
    // Server command (no longer default)
    .command(
      ['server'],
      'Start the MCP server with specified transport',
      {
        transportType: {
          type: 'string',
          demandOption: true,
          choices: ['stdio', 'httpStream'],
          description: 'Transport type (stdio or httpStream)',
        },
        endpoint: {
          type: 'string',
          default: '/mcp',
          description: 'Path for HTTP Stream transport',
        },
        port: {
          type: 'number',
          default: 8081,
          description: 'Port for HTTP Stream transport',
        },
        host: {
          type: 'string',
          default: '127.0.0.1',
          description:
            'Host/interface to bind for HTTP Stream transport (use 0.0.0.0 to expose on all interfaces)',
        },
      },
      (argv) => {
        // Pass configuration path to initialize config system properly
        if (argv.config) {
          process.argv.push('--config', argv.config as string);
        }

        startServer(
          argv.transportType as 'stdio' | 'httpStream',
          argv.endpoint,
          argv.port,
          argv.host,
        ).catch((error) => {
          displayError('Error starting server', error);
          process.exit(1);
        });
      },
    )
    // List tools command
    .command(
      'list-tools',
      'List all available tools',
      {
        filtered: {
          type: 'boolean',
          description: 'Show only tools enabled by configuration',
        },
        json: {
          type: 'boolean',
          description: 'Output tools in JSON format',
        },
        native: {
          type: 'boolean',
          description: 'Show only native tools (skip bundled, remote, and local MCPs)',
        },
      },
      (argv) => {
        // Pass configuration path to initialize config system properly
        if (argv.config) {
          process.argv.push('--config', argv.config as string);
        }

        listTools().catch((error) => {
          displayError('Error in list-tools command', error);
          process.exit(1);
        });
      },
    )
    // List bundled MCPs command
    .command(
      'list-bundled-mcps',
      'List all bundled MCP servers',
      {
        json: {
          type: 'boolean',
          description: 'Output in JSON format',
        },
        dir: {
          type: 'string',
          description: 'Directory containing bundled MCPs',
        },
      },
      (argv) => {
        listBundledMCPs({
          json: argv.json as boolean,
          dir: argv.dir as string,
        }).catch((error) => {
          displayError('Error in list-bundled-mcps command', error);
          process.exit(1);
        });
      },
    )
    .command(
      'list-remote-mcps',
      'List all available remote MCPs',
      {
        filtered: {
          type: 'boolean',
          description: 'Show only MCPs enabled by configuration',
        },
        tools: {
          type: 'boolean',
          description: 'Show tools provided by each remote MCP',
        },
        json: {
          type: 'boolean',
          description: 'Output in JSON format',
        },
      },
      (_argv) => {
        listRemoteMCPs().catch((error) => {
          displayError('Error in list-remote-mcps command', error);
          process.exit(1);
        });
      },
    )
    .command(
      'list-local-mcps',
      'List all available local MCPs',
      {
        filtered: {
          type: 'boolean',
          description: 'Show only tools enabled by configuration',
        },
        json: {
          type: 'boolean',
          description: 'Output tools in JSON format',
        },
      },
      (_argv) => {
        listLocalMCPs().catch((error) => {
          displayError('Error in list-local-mcps command', error);
          process.exit(1);
        });
      },
    )
    // List prompts command
    .command(
      'list-prompts',
      'List all available prompts',
      {
        json: { type: 'boolean', description: 'Output prompts in JSON format' },
        filtered: {
          type: 'boolean',
          description: 'Show only prompts enabled by configuration',
        },
      },
      (_argv) => {
        listPrompts().catch((error) => {
          displayError('Error in list-prompts command', error);
          process.exit(1);
        });
      },
    )
    // Get prompt command
    .command(
      'get-prompt <id>',
      'Get a specific prompt by ID',
      (yargs) => {
        return yargs.positional('id', {
          type: 'string',
          description: 'ID of the prompt to retrieve',
          demandOption: true,
        });
      },
      (argv) => {
        getPrompt(argv.id).catch((error) => {
          displayError('Error in get-prompt command', error);
          process.exit(1);
        });
      },
    )
    // List resources command
    .command(
      'list-resources',
      'List all available resources',
      {
        json: { type: 'boolean', description: 'Output prompts in JSON format' },
        filtered: {
          type: 'boolean',
          description: 'Show only prompts enabled by configuration',
        },
      },
      (_argv) => {
        listResources().catch((error) => {
          displayError('Error in list-resources command', error);
          process.exit(1);
        });
      },
    )
    .command('info', 'Display information about the MCP server', (_argv) => {
      // Display server information

      let configPath: string;

      const config = loadConfig();
      if (!config) {
        configPath = 'No configuration file found';
      } else {
        configPath = config.source || 'No configuration file found';
      }

      displayHeader(false);
      console.log(`Version: ${version}`);
      console.log(`Config Path: ${configPath}\n`);
    })
    // Generate config command
    .command(
      'generate-config',
      'Generate a template configuration file',
      {
        output: {
          type: 'string',
          alias: 'o',
          description: 'Path where to save the configuration file',
        },
        force: {
          type: 'boolean',
          alias: 'f',
          description: 'Overwrite existing file if it exists',
        },
      },
      (argv) => {
        generateConfig(argv.output as string).catch((error) => {
          displayError('Error generating config', error);
          process.exit(1);
        });
      },
    )
    // Doctor command - diagnose configuration issues
    .command(
      'doctor',
      'Diagnose MCP configuration issues',
      {
        path: {
          type: 'string',
          alias: 'p',
          description: 'Path to configuration file to check',
        },
        json: {
          type: 'boolean',
          alias: 'j',
          description: 'Output results as JSON instead of human-readable format',
        },
        verbose: {
          type: 'boolean',
          alias: 'v',
          description: 'Show all checks performed, even passing ones',
        },
        quiet: {
          type: 'boolean',
          alias: 'q',
          description: 'Only show errors (for CI/CD pipelines)',
        },
      },
      (argv) => {
        doctor(argv.path as string, {
          json: argv.json as boolean,
          verbose: argv.verbose as boolean,
          quiet: argv.quiet as boolean,
        })
          .then((exitCode) => {
            process.exit(exitCode);
          })
          .catch((error) => {
            displayError('Error running diagnostics', error);
            process.exit(1);
          });
      },
    )
    // Global options
    .options({
      config: {
        type: 'string',
        description: 'Path to configuration file',
      },
    })
    .help()
    .alias('help', 'h')
    // Update command
    .command(
      'update [target]',
      'Update the QNSC MCP CLI to the latest version',
      (yargs) => {
        return yargs
          .positional('target', {
            type: 'string',
            description: 'Deprecated: use "qnsc-mcp install <version|pr<num>>" instead',
          })
          .option('checkOnly', {
            type: 'boolean',
            description: 'Only check for updates without installing',
          })
          .option('force', {
            type: 'boolean',
            description: 'Skip confirmation prompt and update automatically',
          })
          .option('nonInteractive', {
            type: 'boolean',
            alias: 'non-interactive',
            description: 'Run without interactive prompts (for use by installer)',
          });
      },
      (argv) => {
        update(argv).catch((error) => {
          displayError('Error in update command', error);
          process.exit(1);
        });
      },
    )
    .command(
      'install [target]',
      'Install a specific version or PR build (e.g., qnsc-mcp install v1.2.3 or qnsc-mcp install pr899). With no target, installs latest.',
      (yargs) => {
        return yargs
          .positional('target', {
            type: 'string',
            description: 'Version (e.g., v1.2.3) or PR build (e.g., pr899) to install',
          })
          .option('force', {
            type: 'boolean',
            description: 'Skip confirmation prompt and install automatically',
          })
          .option('nonInteractive', {
            type: 'boolean',
            alias: 'non-interactive',
            description: 'Run without interactive prompts (for use by installer)',
          });
      },
      (argv) => {
        install(argv).catch((error) => {
          displayError('Error in install command', error);
          process.exit(1);
        });
      },
    )
    .command(
      'view-logs',
      'View MCP tool logs with optional tailing',
      {
        tail: {
          type: 'boolean',
          description: 'Continuously watch the log file for changes',
        },
        lines: {
          type: 'number',
          description: 'Number of lines to display (for non-tail mode)',
        },
      },
      (argv) => {
        viewLogs({
          tail: argv.tail as boolean,
          lines: argv.lines as number,
        }).catch((error) => {
          displayError('Error viewing logs', error);
          process.exit(1);
        });
      },
    )
    // Reauth command
    .command(
      'reauth <service>',
      'Force re-authentication for a service (e.g. Platform, Slack, Entra)',
      (yargs) => {
        return yargs.positional('service', {
          type: 'string',
          description: 'Service to re-authenticate (e.g. Platform, Entra, Slack)',
          demandOption: true,
        });
      },
      (argv) => {
        reauth(argv.service)
          .then((exitCode) => {
            process.exit(exitCode);
          })
          .catch((error) => {
            displayError('Error during re-authentication', error);
            process.exit(1);
          });
      },
    )
    // Logout command
    .command(
      'logout <server>',
      'Log out of a single remote MCP server (clears the local token and opens the gateway credential manager to revoke)',
      (yargs) => {
        return yargs.positional('server', {
          type: 'string',
          description: 'Remote MCP server id to log out of (see `list-remote-mcps`)',
          demandOption: true,
        });
      },
      (argv) => {
        logout(argv.server)
          .then((exitCode) => {
            process.exit(exitCode);
          })
          .catch((error) => {
            displayError('Error during logout', error);
            process.exit(1);
          });
      },
    )
    .recommendCommands()
    .strict()
    // Add a new default command handler
    .command(
      '$0',
      'Default command - runs stdio transport by default',
      {
        transportType: {
          type: 'string',
          choices: ['stdio', 'httpStream'],
          description: 'Transport type (stdio or httpStream)',
        },
        endpoint: {
          type: 'string',
          default: '/mcp',
          description: 'Path for HTTP Stream transport',
        },
        port: {
          type: 'number',
          default: 8081,
          description: 'Port for HTTP Stream transport',
        },
        host: {
          type: 'string',
          default: '127.0.0.1',
          description:
            'Host/interface to bind for HTTP Stream transport (use 0.0.0.0 to expose on all interfaces)',
        },
      },
      (argv) => {
        if (argv.transportType) {
          // If transportType is provided, run the server with that transport
          startServer(
            argv.transportType as 'stdio' | 'httpStream',
            argv.endpoint,
            argv.port,
            argv.host,
          ).catch((error) => {
            displayError('Error starting server', error);
            process.exit(1);
          });
        } else {
          // If no transportType is provided, run with stdio transport
          startServer('stdio', argv.endpoint, argv.port, argv.host).catch((error) => {
            displayError('Error starting server', error);
            process.exit(1);
          });
        }
      },
    );

  parser.version(version || 'unknown');

  // Execute the parser
  await parser.parseAsync();
}

if (process.argv[1].endsWith('mcp.ts')) {
  void main();
}
