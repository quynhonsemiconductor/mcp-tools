/**
 * Cross-platform binary execution utilities
 * Uses Bun.spawn for fast process execution
 */

import { validateBinary } from './platform';

/**
 * Result of running a command
 */
export interface CommandResult {
  /** Standard output from the command */
  stdout: string;
  /** Standard error from the command */
  stderr: string;
  /** Exit code (0 = success) */
  exitCode: number;
  /** Whether the command timed out */
  timedOut: boolean;
  /** Execution time in milliseconds */
  duration: number;
  /** The command that was run */
  command: string;
  /** Arguments passed to the command */
  args: string[];
}

/**
 * Options for running a command
 */
export interface RunCommandOptions {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Working directory for the command */
  cwd?: string;
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Input to send to stdin */
  stdin?: string;
}

const DEFAULT_TIMEOUT = 30000;

/**
 * Runs a binary with the specified arguments
 * @param binaryPath - Path to the binary
 * @param args - Arguments to pass to the binary
 * @param options - Execution options
 * @returns The command result
 */
export async function runCommand(
  binaryPath: string,
  args: string[] = [],
  options: RunCommandOptions = {}
): Promise<CommandResult> {
  const { timeout = DEFAULT_TIMEOUT, cwd, env, stdin } = options;
  
  // Validate and resolve the binary path
  const validation = validateBinary(binaryPath);
  if (!validation.valid || !validation.resolvedPath) {
    return {
      stdout: '',
      stderr: validation.error || 'Binary not found',
      exitCode: -1,
      timedOut: false,
      duration: 0,
      command: binaryPath,
      args
    };
  }
  
  const resolvedPath = validation.resolvedPath;
  const startTime = performance.now();
  
  try {
    // Create the subprocess
    const proc = Bun.spawn([resolvedPath, ...args], {
      cwd,
      env: env ? { ...process.env, ...env } : undefined,
      stdin: stdin ? 'pipe' : 'ignore',
      stdout: 'pipe',
      stderr: 'pipe'
    });
    
    // Send stdin if provided
    if (stdin && proc.stdin) {
      proc.stdin.write(stdin);
      proc.stdin.end();
    }
    
    // Create a timeout promise
    let timedOut = false;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        timedOut = true;
        proc.kill();
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);
    });
    
    // Wait for the process to complete or timeout
    const exitCode = await Promise.race([
      proc.exited,
      timeoutPromise
    ]);
    
    const duration = performance.now() - startTime;
    
    // Read stdout and stderr
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    
    return {
      stdout,
      stderr,
      exitCode,
      timedOut,
      duration,
      command: resolvedPath,
      args
    };
  } catch (error) {
    const duration = performance.now() - startTime;
    
    return {
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: -1,
      timedOut: error instanceof Error && error.message.includes('timed out'),
      duration,
      command: resolvedPath,
      args
    };
  }
}

/**
 * Runs a binary with --version and extracts the version string
 * @param binaryPath - Path to the binary
 * @returns The version string or null if not found
 */
export async function getVersion(binaryPath: string): Promise<string | null> {
  const result = await runCommand(binaryPath, ['--version'], { timeout: 10000 });
  
  if (result.exitCode !== 0) {
    return null;
  }
  
  // Try to extract version from output
  const output = result.stdout + result.stderr;
  const versionMatch = output.match(/v?(\d+\.\d+\.\d+(?:-[\\w.]+)?)/);
  
  return versionMatch ? versionMatch[1] : null;
}