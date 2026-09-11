import chalk from 'chalk';
import { execSync } from 'node:child_process';
import nodeFs from 'node:fs';
import nodeOs from 'node:os';
import nodePath from 'node:path';
import nodeReadline from 'node:readline';

/**
 * Dependencies interface for dependency injection in tests
 */
export interface UpdateWindowsDeps {
  fs: {
    writeFileSync: typeof nodeFs.writeFileSync;
    unlinkSync: typeof nodeFs.unlinkSync;
    renameSync: typeof nodeFs.renameSync;
  };
  os: {
    platform: typeof nodeOs.platform;
    tmpdir: typeof nodeOs.tmpdir;
  };
  path: {
    join: typeof nodePath.join;
    dirname: typeof nodePath.dirname;
  };
  execSync: typeof execSync;
  readline: typeof nodeReadline;
}

/**
 * Default dependencies using real Node.js modules.
 * Exported as a const so it's evaluated once at import time.
 */
export const defaultDeps: UpdateWindowsDeps = {
  fs: {
    writeFileSync: nodeFs.writeFileSync,
    unlinkSync: nodeFs.unlinkSync,
    renameSync: nodeFs.renameSync,
  },
  os: {
    platform: nodeOs.platform,
    tmpdir: nodeOs.tmpdir,
  },
  path: {
    join: nodePath.join,
    dirname: nodePath.dirname,
  },
  execSync,
  readline: nodeReadline,
};

/**
 * Read the `code` field (ENOENT, EACCES, EBUSY, ...) that Node decorates onto
 * fs/child_process errors, without assuming the caught value is an Error.
 */
const errorCode = (error: unknown): string | undefined =>
  error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;

/**
 * Result from waitForFileLockRelease with detailed failure information for telemetry.
 */
export interface FileLockWaitResult {
  /** Whether the file is now available for writing */
  canProceed: boolean;
  /** Reason for failure (only set when canProceed is false) */
  failureReason?: 'permission_denied' | 'file_locked_timeout' | 'cancelled' | 'file_locked';
  /** Whether a file lock was initially detected */
  fileLockDetected: boolean;
  /** Process name that was holding the lock (if detected) */
  lockingProcess?: string;
  /** Whether admin privileges are required */
  adminRequired: boolean;
  /** Seconds spent waiting (if waiting occurred) */
  waitTimeSeconds?: number;
}

/**
 * Map of process names to user-friendly display names.
 * Covers common IDEs and editors that might run MCP servers.
 */
const PROCESS_DISPLAY_NAMES: Record<string, string> = {
  // VS Code variants
  code: 'VS Code',
  'code.exe': 'VS Code',
  'code - insiders': 'VS Code Insiders',
  'code - insiders.exe': 'VS Code Insiders',
  // Cursor
  cursor: 'Cursor',
  'cursor.exe': 'Cursor',
  // Windsurf (Codeium)
  windsurf: 'Windsurf',
  'windsurf.exe': 'Windsurf',
  // Zed
  zed: 'Zed',
  'zed.exe': 'Zed',
  // JetBrains IDEs
  idea64: 'IntelliJ IDEA',
  'idea64.exe': 'IntelliJ IDEA',
  idea: 'IntelliJ IDEA',
  'idea.exe': 'IntelliJ IDEA',
  webstorm64: 'WebStorm',
  'webstorm64.exe': 'WebStorm',
  webstorm: 'WebStorm',
  'webstorm.exe': 'WebStorm',
  pycharm64: 'PyCharm',
  'pycharm64.exe': 'PyCharm',
  pycharm: 'PyCharm',
  'pycharm.exe': 'PyCharm',
  goland64: 'GoLand',
  'goland64.exe': 'GoLand',
  rider64: 'Rider',
  'rider64.exe': 'Rider',
  clion64: 'CLion',
  'clion64.exe': 'CLion',
  rubymine64: 'RubyMine',
  'rubymine64.exe': 'RubyMine',
  phpstorm64: 'PhpStorm',
  'phpstorm64.exe': 'PhpStorm',
  // Neovim
  nvim: 'Neovim',
  'nvim.exe': 'Neovim',
  // Sublime Text
  sublime_text: 'Sublime Text',
  'sublime_text.exe': 'Sublime Text',
  // Atom (legacy but still used)
  atom: 'Atom',
  'atom.exe': 'Atom',
};

/**
 * List of IDE process names to check as fallback when we can't detect the specific locking process.
 * Order matters - most common first.
 */
const IDE_PROCESS_NAMES = [
  'Code',
  'Cursor',
  'Code - Insiders',
  'Windsurf',
  'Zed',
  'idea64',
  'webstorm64',
  'pycharm64',
  'goland64',
  'rider64',
  'nvim',
];

/**
 * Get a user-friendly name for a process that might be running an MCP server
 */
export const getProcessDisplayName = (processName: string): string => {
  const lowerName = processName.toLowerCase();

  // Check exact match first
  if (PROCESS_DISPLAY_NAMES[lowerName]) {
    return PROCESS_DISPLAY_NAMES[lowerName];
  }

  // Check for partial matches (e.g., "insiders" in name)
  if (lowerName.includes('insiders')) {
    return 'VS Code Insiders';
  }
  if (lowerName.includes('idea')) {
    return 'IntelliJ IDEA';
  }
  if (lowerName.includes('webstorm')) {
    return 'WebStorm';
  }
  if (lowerName.includes('pycharm')) {
    return 'PyCharm';
  }

  return processName;
};

/**
 * Check if the current user has write permission to a directory.
 * Used to distinguish permission issues from file lock issues.
 */
export const checkDirectoryWritePermission = (
  dirPath: string,
  deps: UpdateWindowsDeps = defaultDeps,
): boolean => {
  // Extract functions to local variables to avoid any potential proxy issues
  const writeFile = deps.fs.writeFileSync;
  const unlinkFile = deps.fs.unlinkSync;
  const joinPath = deps.path.join;
  try {
    const testFile = joinPath(dirPath, `.write-test-${Date.now()}`);
    writeFile(testFile, '');
    unlinkFile(testFile);
    return true;
  } catch (err: unknown) {
    const code = errorCode(err);
    if (code === 'EACCES' || code === 'EPERM') {
      return false; // Permission denied — sudo may help
    }
    // Non-permission errors (ENOENT, EROFS, ENOSPC, etc.) indicate problems sudo won't fix
    throw err;
  }
};

/**
 * Check if a file is locked on Windows by attempting to rename it.
 * This is more reliable than fs.openSync because Windows blocks rename
 * operations on files with open handles regardless of sharing mode.
 * Returns an object with lock status, permission status, and any detected locking processes.
 */
export const checkWindowsFileLock = (
  filePath: string,
  deps: UpdateWindowsDeps = defaultDeps,
): { isLocked: boolean; noPermission: boolean; processes: string[] } => {
  // Extract functions to local variables to avoid any potential proxy issues
  const getPlatform = deps.os.platform;
  const getDirname = deps.path.dirname;
  const renameFile = deps.fs.renameSync;

  if (getPlatform() !== 'win32') {
    return { isLocked: false, noPermission: false, processes: [] };
  }

  // First check if we have write permission to the directory
  const dirPath = getDirname(filePath);
  const hasPermission = checkDirectoryWritePermission(dirPath, deps);
  if (!hasPermission) {
    return { isLocked: false, noPermission: true, processes: [] };
  }

  // We have permission, so now check if the file is locked
  let isLocked = false;
  try {
    const tempName = filePath + '.locktest.' + Date.now();
    renameFile(filePath, tempName);
    renameFile(tempName, filePath); // Rename back immediately
  } catch (err: unknown) {
    const code = errorCode(err);
    if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
      isLocked = true;
    }
  }

  // Process detection is best-effort for diagnostics only
  const processes: string[] = [];
  if (isLocked) {
    // Try multiple approaches to detect the locking process
    let scriptFile: string | null = null;
    try {
      // Escape single quotes for PowerShell single-quoted string
      const escapedPath = filePath.replace(/'/g, "''");

      // This script tries multiple approaches:
      // 1. First, try to find processes that have the file open using .NET
      // 2. Fall back to checking running IDE processes
      const psScript = `
$targetFile = '${escapedPath}'
$results = @()

# Approach 1: Check all processes to see if any have modules loaded from same directory
# (MCP servers spawn from the IDE but may load the binary)
$targetDir = Split-Path $targetFile -Parent
$targetName = Split-Path $targetFile -Leaf
Get-Process | Where-Object { $_.Path -and (Split-Path $_.Path -Parent) -eq $targetDir } | ForEach-Object {
    $results += "$($_.Name) (PID: $($_.Id))"
}

# Approach 2: If no results, check for common IDE processes that might have spawned MCP
if ($results.Count -eq 0) {
    $ideNames = @(${IDE_PROCESS_NAMES.map((n) => `'${n}'`).join(', ')})
    foreach ($ideName in $ideNames) {
        $proc = Get-Process -Name $ideName -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($proc) {
            $results += "$($proc.Name)"
            break
        }
    }
}

$results -join ';'
`;
      scriptFile = deps.path.join(deps.os.tmpdir(), `qnscmcp-detect-${Date.now()}.ps1`);
      deps.fs.writeFileSync(scriptFile, psScript, { encoding: 'utf-8' });

      const result = deps
        .execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${scriptFile}"`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 5000, // 5 second timeout to avoid hanging
        })
        .trim();

      if (result) {
        // Parse results and convert to friendly names
        const rawProcesses = result.split(';').filter(Boolean);
        for (const proc of rawProcesses) {
          // Extract process name (may have PID suffix)
          const nameMatch = proc.match(/^([^(]+)/);
          if (nameMatch) {
            const rawName = nameMatch[1].trim();
            const friendlyName = getProcessDisplayName(rawName);
            // Include PID if present, otherwise add "may be running MCP server"
            if (proc.includes('PID:')) {
              processes.push(proc.replace(rawName, friendlyName));
            } else {
              processes.push(`${friendlyName} (may be running MCP server)`);
            }
          }
        }
      }
    } catch {
      // Ignore errors - this is just for diagnostics
    } finally {
      // Clean up temp script file
      if (scriptFile) {
        try {
          deps.fs.unlinkSync(scriptFile);
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    if (processes.length === 0) {
      processes.push('Unknown process');
    }
  }

  return { isLocked, noPermission: false, processes };
};

/**
 * Get the terminal width, with a sensible default
 */
const getTerminalWidth = (): number => {
  try {
    return process.stdout.columns || 80;
  } catch {
    return 80;
  }
};

/**
 * Wait for the user to close the blocking application, with interactive prompts in the CLI.
 * Returns a detailed result object with failure information for telemetry.
 *
 * @param filePath - Path to the file to check
 * @param maxWaitSeconds - Maximum time to wait (default 300s for interactive, 10s for non-interactive)
 * @param deps - Dependencies for testing
 * @param nonInteractive - If true, skip interactive prompts and use short timeout
 */
export const waitForFileLockRelease = async (
  filePath: string,
  maxWaitSeconds: number = 300,
  deps: UpdateWindowsDeps = defaultDeps,
  nonInteractive: boolean = false,
): Promise<FileLockWaitResult> => {
  // Only relevant on Windows
  if (deps.os.platform() !== 'win32') {
    return {
      canProceed: true,
      fileLockDetected: false,
      adminRequired: false,
    };
  }

  const initialCheck = checkWindowsFileLock(filePath, deps);

  // Check for permission issue first - this is different from a file lock
  if (initialCheck.noPermission) {
    console.log('');
    console.log(chalk.red('❌ Permission denied: Cannot update qnsc-mcp in this location.'));
    console.log('');
    console.log(chalk.white(`   The installation directory requires administrator privileges.`));
    console.log('');
    console.log(chalk.cyan('   To update, please run your terminal as Administrator:'));
    console.log(chalk.dim('   1. Close this terminal'));
    console.log(chalk.dim('   2. Right-click on your terminal application'));
    console.log(chalk.dim('   3. Select "Run as administrator"'));
    console.log(chalk.dim('   4. Run: qnsc-mcp update'));
    console.log('');
    return {
      canProceed: false,
      failureReason: 'permission_denied',
      fileLockDetected: false,
      adminRequired: true,
    };
  }

  if (!initialCheck.isLocked) {
    return {
      canProceed: true,
      fileLockDetected: false,
      adminRequired: false,
    };
  }

  // Determine what's blocking the file for user-friendly messaging
  const blockingProcesses = initialCheck.processes;
  const firstProcess = blockingProcesses[0] || 'Unknown process';
  const processNameMatch = firstProcess.match(/^([^(]+)/);
  const processDisplayName = processNameMatch
    ? getProcessDisplayName(processNameMatch[1].trim())
    : 'the blocking application';

  // Non-interactive mode: short wait without prompts (for installer)
  if (nonInteractive) {
    const nonInteractiveWaitSeconds = 10;
    const startTime = Date.now();

    while (true) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed >= nonInteractiveWaitSeconds) {
        // Still locked after short wait - fail
        return {
          canProceed: false,
          failureReason: 'file_locked',
          fileLockDetected: true,
          lockingProcess: processDisplayName,
          adminRequired: false,
          waitTimeSeconds: elapsed,
        };
      }

      // Check if file is now unlocked
      const check = checkWindowsFileLock(filePath, deps);
      if (!check.isLocked) {
        return {
          canProceed: true,
          fileLockDetected: true,
          lockingProcess: processDisplayName,
          adminRequired: false,
          waitTimeSeconds: elapsed,
        };
      }

      // Wait 1 second before next check
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Interactive mode: show prompts and wait longer
  // File is locked - prompt user with actual process info
  console.log('');
  console.log(chalk.yellow('⚠️  qnsc-mcp.exe is currently in use and cannot be updated.'));
  console.log('');
  if (blockingProcesses.length > 0 && !blockingProcesses[0].includes('Unknown')) {
    console.log(chalk.white(`   Blocked by: ${chalk.bold(blockingProcesses.join(', '))}`));
  } else {
    console.log(
      chalk.white(
        '   The file is locked by another process (likely an IDE running the MCP server).',
      ),
    );
  }
  console.log('');
  console.log(
    chalk.cyan(`   To continue, close ${processDisplayName} or stop the MCP server extension.`),
  );
  console.log(chalk.dim(`   (The update will proceed automatically once the file is released)`));
  console.log('');

  // Set up readline for Ctrl+C handling
  const rl = deps.readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let cancelled = false;
  rl.on('close', () => {
    cancelled = true;
  });

  // Polling loop - wrapped in try/finally to ensure rl.close() is always called
  const startTime = Date.now();
  const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIndex = 0;

  try {
    while (!cancelled) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed >= maxWaitSeconds) {
        console.log('');
        console.log(
          chalk.red(
            `\n❌ Timed out waiting for file to be released after ${maxWaitSeconds} seconds.`,
          ),
        );
        return {
          canProceed: false,
          failureReason: 'file_locked_timeout',
          fileLockDetected: true,
          lockingProcess: processDisplayName,
          adminRequired: false,
          waitTimeSeconds: elapsed,
        };
      }

      // Check if file is now unlocked
      const check = checkWindowsFileLock(filePath, deps);
      if (!check.isLocked) {
        // Clear the waiting line using actual terminal width
        const termWidth = getTerminalWidth();
        process.stdout.write('\r' + ' '.repeat(termWidth - 1) + '\r');
        console.log(chalk.green('✓ File released. Proceeding with update...'));
        console.log('');
        return {
          canProceed: true,
          fileLockDetected: true,
          lockingProcess: processDisplayName,
          adminRequired: false,
          waitTimeSeconds: elapsed,
        };
      }

      // Show spinner with elapsed time, max timeout, and cancel hint
      const spinner = spinnerFrames[frameIndex % spinnerFrames.length];
      frameIndex++;
      process.stdout.write(
        `\r${chalk.cyan(spinner)} Waiting for ${processDisplayName} to close... (${elapsed}s/${maxWaitSeconds}s, ${chalk.dim('Ctrl+C to cancel')})`,
      );

      // Wait 500ms before next check
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // User cancelled via Ctrl+C
    const finalElapsed = Math.floor((Date.now() - startTime) / 1000);
    console.log('');
    console.log(chalk.yellow('\n⚠️  Update cancelled.'));
    return {
      canProceed: false,
      failureReason: 'cancelled',
      fileLockDetected: true,
      lockingProcess: processDisplayName,
      adminRequired: false,
      waitTimeSeconds: finalElapsed,
    };
  } finally {
    rl.close();
  }
};
