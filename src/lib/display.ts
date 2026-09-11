import chalk from 'chalk';
import { logError } from '../services/logger';

/**
 * ASCII art header for QNSC MCP TOOLKIT
 */
const ASCII_HEADER = `

 ██████  █████  ██     ███    ███  ██████ ██████
██      ██   ██ ██     ████  ████ ██      ██   ██
██      ███████ ██     ██ ████ ██ ██      ██████
██      ██   ██ ██     ██  ██  ██ ██      ██
 ██████ ██   ██ ██     ██      ██  ██████ ██

QNSC  🛠️  Model Context Protocol Tools

`;

/**
 * Display the ASCII header and optional version information
 * @param showVersion Whether to show version information (default: true)
 */
export function displayHeader(showVersion = true): void {
  console.log(chalk.cyan(ASCII_HEADER));

  if (showVersion) {
    try {
      const packageJson = require('../../package.json');
      console.log(chalk.dim(` v${packageJson.version}`));
    } catch {
      // If package.json can't be loaded, just skip the version info
    }

    console.log('');
  }
}

/**
 * Format a section header with consistent styling
 * @param title The section title
 * @param count Optional count to append in parentheses
 */
export function formatSectionHeader(title: string, count?: number): string {
  const displayTitle = count !== undefined ? `${title} (${count})` : title;
  return `\n${chalk.bold(displayTitle)}\n${chalk.cyan('─'.repeat(displayTitle.length))}`;
}

/**
/**
 * Format error messages with consistent styling
 * @param message The error message to display
 * @param error Optional error object to include details from
 */
export function displayError(message: string, error?: Error | unknown): void {
  logError(message);

  if (error) {
    // If it's an Error object, get the message property
    if (error instanceof Error) {
      logError(error.message);

      // If there's a stack trace in development mode, show that too
      if (process.env.NODE_ENV === 'development' && error.stack) {
        logError(`${error.stack.split('\n').slice(1).join('\n   ')}`);
      }
    } else if (typeof error === 'string') {
      logError(error);
    } else {
      // For other types, try to stringify
      try {
        logError(JSON.stringify(error, null, 2));
      } catch {
        logError('[Unable to stringify error details]');
      }
    }
  }
}

/**
 * Write JSON output to stdout and wait for it to flush.
 * This prevents truncation issues on Linux when piping output.
 * @param data The data to serialize and output as JSON
 * @param indent Number of spaces for indentation (default: 2)
 */
export async function writeJsonOutput(data: unknown, indent: number = 2): Promise<void> {
  const jsonString = JSON.stringify(data, null, indent) + '\n';
  await new Promise<void>((resolve, reject) => {
    const canContinue = process.stdout.write(jsonString, (err) => {
      if (err) reject(err);
    });
    if (canContinue) {
      resolve();
    } else {
      process.stdout.once('drain', resolve);
    }
  });
}
