/**
 * Platform-specific installation logic for QNSC-MCP.
 * Extracted from main.ts to improve code organization.
 */
import * as fs from 'fs';
import { exec } from 'child_process';
import * as sudo from '@vscode/sudo-prompt';
import { sanitizePath } from './utils';

/**
 * Configuration for platform installation functions.
 */
export interface PlatformInstallConfig {
  /** Current platform (from os.platform()) */
  platform: NodeJS.Platform;
  /** Function to get the shell profile path for PATH additions */
  getShellProfilePath: (installDir: string) => string | null;
}

/**
 * Install the binary on Windows with elevated privileges.
 */
export async function installWindows(
  sourcePath: string,
  installDir: string,
  targetPath: string,
  addToPath: boolean
): Promise<void> {
  // Sanitize all paths before using in shell commands
  const safeSourcePath = sanitizePath(sourcePath);
  const safeInstallDir = sanitizePath(installDir);
  const safeTargetPath = sanitizePath(targetPath);

  return new Promise((resolve, reject) => {
    // Build a PowerShell script for safer execution
    // Using PowerShell avoids the setx PATH truncation issue
    const psCommands: string[] = [
      // Create directory if it doesn't exist
      `if (-not (Test-Path '${safeInstallDir}')) { New-Item -ItemType Directory -Path '${safeInstallDir}' -Force | Out-Null }`,
      // Copy the binary
      `Copy-Item -Path '${safeSourcePath}' -Destination '${safeTargetPath}' -Force`,
      // Store install path in registry for uninstaller to find
      `$qnscMcpRegPath = 'Registry::HKEY_LOCAL_MACHINE\\Software\\QNSC-MCP'`,
      `if (-not (Test-Path $qnscMcpRegPath)) { New-Item -Path $qnscMcpRegPath -Force | Out-Null }`,
      `Set-ItemProperty -Path $qnscMcpRegPath -Name 'InstallPath' -Value '${safeInstallDir}'`,
    ];

    if (addToPath) {
      // Safely add to system PATH using registry (avoids setx truncation)
      // This reads the current Machine PATH from registry, checks if dir is already there,
      // and appends only if needed. Uses -ErrorAction Stop to ensure failures are caught.
      psCommands.push(
        `$ErrorActionPreference = 'Stop'`,
        `$regPath = 'Registry::HKEY_LOCAL_MACHINE\\System\\CurrentControlSet\\Control\\Session Manager\\Environment'`,
        `$currentPath = (Get-ItemProperty -Path $regPath -Name PATH).PATH`,
        `if (($currentPath -split ';') -notcontains '${safeInstallDir}') {`,
        `  $newPath = $currentPath + ';${safeInstallDir}'`,
        `  Set-ItemProperty -Path $regPath -Name PATH -Value $newPath`,
        `  # Verify the registry update succeeded`,
        `  $verifyPath = (Get-ItemProperty -Path $regPath -Name PATH).PATH`,
        `  if (($verifyPath -split ';') -notcontains '${safeInstallDir}') {`,
        `    throw 'Failed to update PATH in registry'`,
        `  }`,
        `  # Broadcast WM_SETTINGCHANGE so other apps pick up the change`,
        `  Add-Type -Namespace Win32 -Name NativeMethods -MemberDefinition '[DllImport(\"user32.dll\", SetLastError = true, CharSet = CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);'`,
        `  $HWND_BROADCAST = [IntPtr]0xffff`,
        `  $WM_SETTINGCHANGE = 0x1a`,
        `  $result = [UIntPtr]::Zero`,
        `  [Win32.NativeMethods]::SendMessageTimeout($HWND_BROADCAST, $WM_SETTINGCHANGE, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result) | Out-Null`,
        `}`
      );
    }

    const psScript = psCommands.join('\n');

    // Encode the script as Base64 UTF-16LE for PowerShell's -EncodedCommand
    // This eliminates all escaping issues and prevents command injection
    const encodedScript = Buffer.from(psScript, 'utf16le').toString('base64');

    // Run PowerShell with elevated privileges using -EncodedCommand for safety
    sudo.exec(
      `powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedScript}`,
      { name: 'QNSC MCP Installer' },
      (error?: Error) => {
        if (error) {
          reject(new Error(`Installation failed: ${error.message}`));
        } else {
          resolve();
        }
      }
    );
  });
}

/**
 * Install the binary on Unix-like systems (macOS, Linux).
 */
export async function installUnix(
  sourcePath: string,
  installDir: string,
  targetPath: string,
  addToPath: boolean,
  config: PlatformInstallConfig
): Promise<void> {
  // Sanitize all paths before using in shell commands
  const safeSourcePath = sanitizePath(sourcePath);
  const safeInstallDir = sanitizePath(installDir);
  const safeTargetPath = sanitizePath(targetPath);

  return new Promise((resolve, reject) => {
    const commands = [
      `mkdir -p '${safeInstallDir}'`,
      `cp '${safeSourcePath}' '${safeTargetPath}'`,
      `chmod +x '${safeTargetPath}'`,
    ];

    // Remove quarantine and re-sign on macOS
    // Cross-compiled binaries need to be re-signed locally for macOS to trust them
    if (config.platform === 'darwin') {
      commands.push(`xattr -d com.apple.quarantine '${safeTargetPath}' 2>/dev/null || true`);
      commands.push(`codesign --remove-signature '${safeTargetPath}' 2>/dev/null || true`);
      commands.push(`codesign --force --sign - '${safeTargetPath}'`);
    }

    const script = commands.join(' && ');

    // Check if we need elevation
    const needsSudo = installDir.startsWith('/usr') || installDir.startsWith('/opt');

    const onInstallComplete = () => {
      // Handle PATH addition for non-standard directories
      if (addToPath) {
        const profilePath = config.getShellProfilePath(safeInstallDir);
        if (profilePath) {
          addToUnixPath(safeInstallDir, profilePath);
        }
      }
      resolve();
    };

    if (needsSudo) {
      sudo.exec(
        script,
        { name: 'QNSC MCP Installer' },
        (error?: Error) => {
          if (error) {
            reject(new Error(`Installation failed: ${error.message}`));
          } else {
            onInstallComplete();
          }
        }
      );
    } else {
      exec(script, (error) => {
        if (error) {
          reject(new Error(`Installation failed: ${error.message}`));
        } else {
          onInstallComplete();
        }
      });
    }
  });
}

/**
 * Add a directory to PATH in the user's shell profile.
 */
export function addToUnixPath(installDir: string, profilePath: string): void {
  try {
    const exportLine = `export PATH="$PATH:${installDir}"`;
    const existingContent = fs.existsSync(profilePath) ? fs.readFileSync(profilePath, 'utf-8') : '';

    // Check if already configured
    if (existingContent.includes(installDir)) {
      console.log(`PATH already configured in ${profilePath}`);
      return;
    }

    const addition = `\n# Added by QNSC-MCP Installer\n${exportLine}\n`;
    fs.appendFileSync(profilePath, addition);
    console.log(`Added ${installDir} to PATH in ${profilePath}`);
  } catch (error: any) {
    console.warn('Failed to add to PATH:', error.message);
  }
}
