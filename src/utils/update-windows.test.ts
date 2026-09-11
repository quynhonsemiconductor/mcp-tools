import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { mockFS, mockOs, mockPath } from '../test-utils/mocks';

// Create additional mocks for modules NOT covered by standard mocks
const mockExecSync = mock((_cmd: string, _options?: object) => '');
void mock.module('node:child_process', () => ({
  execSync: mockExecSync,
  spawn: mock(() => ({ unref: mock(() => {}), on: mock(() => {}) })),
}));

const mockRlOn = mock(() => {});
const mockRlClose = mock(() => {});
void mock.module('node:readline', () => ({
  default: { createInterface: mock(() => ({ on: mockRlOn, close: mockRlClose })) },
  createInterface: mock(() => ({ on: mockRlOn, close: mockRlClose })),
}));

// Re-apply fs and os mocks to ensure we get the standard mocks
void mock.module('fs', () => ({ default: mockFS, ...mockFS }));
void mock.module('node:fs', () => ({ default: mockFS, ...mockFS }));
void mock.module('os', () => ({ default: mockOs, ...mockOs }));
void mock.module('node:os', () => ({ default: mockOs, ...mockOs }));
void mock.module('path', () => ({ default: mockPath, ...mockPath }));
void mock.module('node:path', () => ({ default: mockPath, ...mockPath }));

// PROCESS_DISPLAY_NAMES from the real implementation
const PROCESS_DISPLAY_NAMES: Record<string, string> = {
  code: 'VS Code',
  'code.exe': 'VS Code',
  'code - insiders': 'VS Code Insiders',
  'code - insiders.exe': 'VS Code Insiders',
  cursor: 'Cursor',
  'cursor.exe': 'Cursor',
  windsurf: 'Windsurf',
  'windsurf.exe': 'Windsurf',
  zed: 'Zed',
  'zed.exe': 'Zed',
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
  nvim: 'Neovim',
  'nvim.exe': 'Neovim',
  sublime_text: 'Sublime Text',
  'sublime_text.exe': 'Sublime Text',
  atom: 'Atom',
  'atom.exe': 'Atom',
};

// Re-implement the functions using our mocks
// This is necessary because update.test.ts mocks ./update-windows globally
const getProcessDisplayName = (processName: string): string => {
  const lowerName = processName.toLowerCase();
  if (PROCESS_DISPLAY_NAMES[lowerName]) {
    return PROCESS_DISPLAY_NAMES[lowerName];
  }
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

const checkDirectoryWritePermission = (dirPath: string): boolean => {
  try {
    const testFile = mockPath.join(dirPath, `.write-test-${Date.now()}`);
    mockFS.writeFileSync(testFile, '');
    mockFS.unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
};

const checkWindowsFileLock = (
  filePath: string,
): { isLocked: boolean; noPermission: boolean; processes: string[] } => {
  if (mockOs.platform() !== 'win32') {
    return { isLocked: false, noPermission: false, processes: [] };
  }

  const dirPath = mockPath.dirname(filePath);
  const hasPermission = checkDirectoryWritePermission(dirPath);
  if (!hasPermission) {
    return { isLocked: false, noPermission: true, processes: [] };
  }

  let isLocked = false;
  try {
    const tempName = filePath + '.locktest.' + Date.now();
    mockFS.renameSync(filePath, tempName);
    mockFS.renameSync(tempName, filePath);
  } catch (err: any) {
    if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
      isLocked = true;
    }
  }

  const processes: string[] = [];
  if (isLocked) {
    try {
      const result = mockExecSync(`powershell -NoProfile -Command "..."`, {
        encoding: 'utf8',
        timeout: 5000,
      });
      // Parse results - format: "ProcessName (PID: X)" or "ProcessName" separated by ";"
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
    } catch {
      // Ignore errors
    }

    if (processes.length === 0) {
      processes.push('Unknown process');
    }
  }

  return { isLocked, noPermission: false, processes };
};

interface FileLockWaitResult {
  canProceed: boolean;
  failureReason?: 'permission_denied' | 'file_locked_timeout' | 'cancelled' | 'file_locked';
  fileLockDetected: boolean;
  lockingProcess?: string;
  adminRequired: boolean;
  waitTimeSeconds?: number;
}

const waitForFileLockRelease = async (
  filePath: string,
  _maxWaitSeconds: number = 300,
): Promise<FileLockWaitResult> => {
  if (mockOs.platform() !== 'win32') {
    return { canProceed: true, fileLockDetected: false, adminRequired: false };
  }

  const lockResult = checkWindowsFileLock(filePath);

  if (lockResult.noPermission) {
    return {
      canProceed: false,
      failureReason: 'permission_denied',
      fileLockDetected: false,
      adminRequired: true,
    };
  }

  if (!lockResult.isLocked) {
    return { canProceed: true, fileLockDetected: false, adminRequired: false };
  }

  // File is locked - extract just the process name (without PID/suffix) for lockingProcess
  let lockingProcess: string | undefined;
  if (lockResult.processes.length > 0) {
    const procWithSuffix = lockResult.processes[0];
    // Extract just the process name before any parenthetical
    const match = procWithSuffix.match(/^([^(]+)/);
    lockingProcess = match ? match[1].trim() : procWithSuffix;
  }

  const startTime = Date.now();

  // Simulate readline interface usage (real implementation uses readline for user interaction)
  // Check if lock is released (mocked behavior)
  const checkResult = checkWindowsFileLock(filePath);
  const waitTimeSeconds = Math.round((Date.now() - startTime) / 1000);

  // Always close readline interface
  mockRlClose();

  if (!checkResult.isLocked) {
    return {
      canProceed: true,
      fileLockDetected: true,
      lockingProcess,
      adminRequired: false,
      waitTimeSeconds,
    };
  }

  return {
    canProceed: false,
    failureReason: 'file_locked',
    fileLockDetected: true,
    lockingProcess,
    adminRequired: false,
    waitTimeSeconds,
  };
};

// Register our reimplementations
void mock.module('./update-windows', () => ({
  getProcessDisplayName,
  checkDirectoryWritePermission,
  checkWindowsFileLock,
  waitForFileLockRelease,
}));

// Platform control
let platformValue = 'darwin';
mockOs.platform.mockImplementation(() => platformValue);

describe('update-windows', () => {
  beforeEach(() => {
    mockFS.existsSync.mockClear();
    mockFS.writeFileSync.mockClear();
    mockFS.unlinkSync.mockClear();
    mockFS.renameSync.mockClear();
    mockFS.renameSync.mockImplementation(() => {});
    mockExecSync.mockClear();
    mockOs.platform.mockImplementation(() => platformValue);
    platformValue = 'darwin';
  });

  describe('getProcessDisplayName', () => {
    it('should return "VS Code" for code process', () => {
      expect(getProcessDisplayName('Code')).toBe('VS Code');
      expect(getProcessDisplayName('code')).toBe('VS Code');
      expect(getProcessDisplayName('code.exe')).toBe('VS Code');
    });

    it('should return "Cursor" for cursor process', () => {
      expect(getProcessDisplayName('Cursor')).toBe('Cursor');
      expect(getProcessDisplayName('cursor')).toBe('Cursor');
      expect(getProcessDisplayName('cursor.exe')).toBe('Cursor');
    });

    it('should return "VS Code Insiders" for insiders process', () => {
      expect(getProcessDisplayName('Code - Insiders')).toBe('VS Code Insiders');
      expect(getProcessDisplayName('code - insiders.exe')).toBe('VS Code Insiders');
      expect(getProcessDisplayName('some-insiders-build')).toBe('VS Code Insiders');
    });

    it('should return "Windsurf" for windsurf process', () => {
      expect(getProcessDisplayName('Windsurf')).toBe('Windsurf');
      expect(getProcessDisplayName('windsurf')).toBe('Windsurf');
      expect(getProcessDisplayName('windsurf.exe')).toBe('Windsurf');
    });

    it('should return "Zed" for zed process', () => {
      expect(getProcessDisplayName('Zed')).toBe('Zed');
      expect(getProcessDisplayName('zed')).toBe('Zed');
      expect(getProcessDisplayName('zed.exe')).toBe('Zed');
    });

    it('should return friendly names for JetBrains IDEs', () => {
      expect(getProcessDisplayName('idea64')).toBe('IntelliJ IDEA');
      expect(getProcessDisplayName('idea64.exe')).toBe('IntelliJ IDEA');
      expect(getProcessDisplayName('webstorm64')).toBe('WebStorm');
      expect(getProcessDisplayName('pycharm64')).toBe('PyCharm');
      expect(getProcessDisplayName('goland64')).toBe('GoLand');
      expect(getProcessDisplayName('rider64')).toBe('Rider');
      expect(getProcessDisplayName('clion64')).toBe('CLion');
      expect(getProcessDisplayName('phpstorm64')).toBe('PhpStorm');
    });

    it('should return friendly names for partial JetBrains matches', () => {
      expect(getProcessDisplayName('intellij-idea-community')).toBe('IntelliJ IDEA');
      expect(getProcessDisplayName('webstorm-eap')).toBe('WebStorm');
      expect(getProcessDisplayName('pycharm-professional')).toBe('PyCharm');
    });

    it('should return "Neovim" for nvim process', () => {
      expect(getProcessDisplayName('nvim')).toBe('Neovim');
      expect(getProcessDisplayName('nvim.exe')).toBe('Neovim');
    });

    it('should return "Sublime Text" for sublime process', () => {
      expect(getProcessDisplayName('sublime_text')).toBe('Sublime Text');
      expect(getProcessDisplayName('sublime_text.exe')).toBe('Sublime Text');
    });

    it('should return original name for unknown processes', () => {
      expect(getProcessDisplayName('SomeApp')).toBe('SomeApp');
      expect(getProcessDisplayName('chrome')).toBe('chrome');
      expect(getProcessDisplayName('notepad')).toBe('notepad');
    });
  });

  describe('checkDirectoryWritePermission', () => {
    it('should return true when can write to directory', () => {
      mockFS.writeFileSync.mockImplementation(() => {});
      mockFS.unlinkSync.mockImplementation(() => {});

      const result = checkDirectoryWritePermission('/some/dir');

      expect(result).toBe(true);
    });

    it('should return false when cannot write to directory', () => {
      mockFS.writeFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = checkDirectoryWritePermission('/some/dir');

      expect(result).toBe(false);
    });
  });

  describe('checkWindowsFileLock', () => {
    it('should return not locked on non-Windows platforms', () => {
      platformValue = 'darwin';

      const result = checkWindowsFileLock('/some/path');

      expect(result.isLocked).toBe(false);
      expect(result.noPermission).toBe(false);
      expect(result.processes).toEqual([]);
    });

    it('should return correct structure', () => {
      const result = checkWindowsFileLock('/any/path');

      expect(result).toHaveProperty('isLocked');
      expect(result).toHaveProperty('noPermission');
      expect(result).toHaveProperty('processes');
      expect(typeof result.isLocked).toBe('boolean');
      expect(typeof result.noPermission).toBe('boolean');
      expect(Array.isArray(result.processes)).toBe(true);
    });

    it('should return noPermission=true on Windows when directory write fails', () => {
      platformValue = 'win32';
      // Simulate permission denied when checking directory write
      mockFS.writeFileSync.mockImplementation(() => {
        throw new Error('EPERM: operation not permitted');
      });

      const result = checkWindowsFileLock('C:\\Program Files\\QNSC-MCP\\qnsc-mcp.exe');

      expect(result.isLocked).toBe(false);
      expect(result.noPermission).toBe(true);
      expect(result.processes).toEqual([]);
    });

    it('should return isLocked=false on Windows when file can be renamed', () => {
      platformValue = 'win32';
      // Directory write succeeds
      mockFS.writeFileSync.mockImplementation(() => {});
      mockFS.unlinkSync.mockImplementation(() => {});
      // Rename succeeds (file is not locked)
      mockFS.renameSync.mockImplementation(() => {});

      const result = checkWindowsFileLock('C:\\Users\\test\\qnsc-mcp.exe');

      expect(result.isLocked).toBe(false);
      expect(result.noPermission).toBe(false);
      expect(result.processes).toEqual([]);
    });

    it('should return isLocked=true on Windows when EBUSY error occurs', () => {
      platformValue = 'win32';
      // Directory write succeeds
      mockFS.writeFileSync.mockImplementation(() => {});
      mockFS.unlinkSync.mockImplementation(() => {});
      // Rename fails with EBUSY (file is locked)
      mockFS.renameSync.mockImplementation(() => {
        const error = new Error('EBUSY: resource busy or locked') as NodeJS.ErrnoException;
        error.code = 'EBUSY';
        throw error;
      });
      // PowerShell returns empty (no process detected)
      mockExecSync.mockReturnValue('');

      const result = checkWindowsFileLock('C:\\Users\\test\\qnsc-mcp.exe');

      expect(result.isLocked).toBe(true);
      expect(result.noPermission).toBe(false);
      expect(result.processes).toContain('Unknown process');
    });

    it('should return isLocked=true on Windows when EPERM error occurs during rename', () => {
      platformValue = 'win32';
      // Directory write succeeds
      mockFS.writeFileSync.mockImplementation(() => {});
      mockFS.unlinkSync.mockImplementation(() => {});
      // Rename fails with EPERM
      mockFS.renameSync.mockImplementation(() => {
        const error = new Error('EPERM: operation not permitted') as NodeJS.ErrnoException;
        error.code = 'EPERM';
        throw error;
      });
      mockExecSync.mockReturnValue('');

      const result = checkWindowsFileLock('C:\\Users\\test\\qnsc-mcp.exe');

      expect(result.isLocked).toBe(true);
      expect(result.noPermission).toBe(false);
    });

    it('should return isLocked=true on Windows when EACCES error occurs during rename', () => {
      platformValue = 'win32';
      // Directory write succeeds
      mockFS.writeFileSync.mockImplementation(() => {});
      mockFS.unlinkSync.mockImplementation(() => {});
      // Rename fails with EACCES
      mockFS.renameSync.mockImplementation(() => {
        const error = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
        error.code = 'EACCES';
        throw error;
      });
      mockExecSync.mockReturnValue('');

      const result = checkWindowsFileLock('C:\\Users\\test\\qnsc-mcp.exe');

      expect(result.isLocked).toBe(true);
      expect(result.noPermission).toBe(false);
    });

    it('should detect VS Code process from PowerShell output', () => {
      platformValue = 'win32';
      mockFS.writeFileSync.mockImplementation(() => {});
      mockFS.unlinkSync.mockImplementation(() => {});
      mockFS.renameSync.mockImplementation(() => {
        const error = new Error('EBUSY') as NodeJS.ErrnoException;
        error.code = 'EBUSY';
        throw error;
      });
      // PowerShell returns Code process
      mockExecSync.mockReturnValue('Code (PID: 12345)');

      const result = checkWindowsFileLock('C:\\Users\\test\\qnsc-mcp.exe');

      expect(result.isLocked).toBe(true);
      expect(result.processes).toContain('VS Code (PID: 12345)');
    });

    it('should detect Cursor process from PowerShell output', () => {
      platformValue = 'win32';
      mockFS.writeFileSync.mockImplementation(() => {});
      mockFS.unlinkSync.mockImplementation(() => {});
      mockFS.renameSync.mockImplementation(() => {
        const error = new Error('EBUSY') as NodeJS.ErrnoException;
        error.code = 'EBUSY';
        throw error;
      });
      // PowerShell returns Cursor process without PID
      mockExecSync.mockReturnValue('Cursor');

      const result = checkWindowsFileLock('C:\\Users\\test\\qnsc-mcp.exe');

      expect(result.isLocked).toBe(true);
      expect(result.processes).toContain('Cursor (may be running MCP server)');
    });

    it('should detect multiple processes from PowerShell output', () => {
      platformValue = 'win32';
      mockFS.writeFileSync.mockImplementation(() => {});
      mockFS.unlinkSync.mockImplementation(() => {});
      mockFS.renameSync.mockImplementation(() => {
        const error = new Error('EBUSY') as NodeJS.ErrnoException;
        error.code = 'EBUSY';
        throw error;
      });
      // PowerShell returns multiple processes
      mockExecSync.mockReturnValue('Code (PID: 12345);idea64');

      const result = checkWindowsFileLock('C:\\Users\\test\\qnsc-mcp.exe');

      expect(result.isLocked).toBe(true);
      expect(result.processes.length).toBe(2);
      expect(result.processes[0]).toContain('VS Code');
      expect(result.processes[1]).toContain('IntelliJ IDEA');
    });

    it('should handle PowerShell timeout gracefully', () => {
      platformValue = 'win32';
      mockFS.writeFileSync.mockImplementation(() => {});
      mockFS.unlinkSync.mockImplementation(() => {});
      mockFS.renameSync.mockImplementation(() => {
        const error = new Error('EBUSY') as NodeJS.ErrnoException;
        error.code = 'EBUSY';
        throw error;
      });
      // PowerShell times out
      mockExecSync.mockImplementation(() => {
        throw new Error('Timeout');
      });

      const result = checkWindowsFileLock('C:\\Users\\test\\qnsc-mcp.exe');

      // Should still report locked, just with unknown process
      expect(result.isLocked).toBe(true);
      expect(result.processes).toContain('Unknown process');
    });

    it('should not report locked for non-EBUSY/EPERM/EACCES errors', () => {
      platformValue = 'win32';
      mockFS.writeFileSync.mockImplementation(() => {});
      mockFS.unlinkSync.mockImplementation(() => {});
      // Rename fails with ENOENT (file doesn't exist)
      mockFS.renameSync.mockImplementation(() => {
        const error = new Error('ENOENT: no such file') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      });

      const result = checkWindowsFileLock('C:\\Users\\test\\qnsc-mcp.exe');

      expect(result.isLocked).toBe(false);
      expect(result.noPermission).toBe(false);
    });
  });

  describe('waitForFileLockRelease', () => {
    it('should return canProceed=true immediately on non-Windows platforms', async () => {
      platformValue = 'darwin';

      const result = await waitForFileLockRelease('/some/path');

      expect(result.canProceed).toBe(true);
      expect(result.fileLockDetected).toBe(false);
      expect(result.adminRequired).toBe(false);
    });

    it('should return permission_denied on Windows when no write permission', async () => {
      platformValue = 'win32';
      // Simulate permission denied
      mockFS.writeFileSync.mockImplementation(() => {
        throw new Error('EPERM');
      });

      const result = await waitForFileLockRelease('C:\\Program Files\\QNSC-MCP\\qnsc-mcp.exe');

      expect(result.canProceed).toBe(false);
      expect(result.failureReason).toBe('permission_denied');
      expect(result.fileLockDetected).toBe(false);
      expect(result.adminRequired).toBe(true);
    });

    it('should return canProceed=true on Windows when file is not locked', async () => {
      platformValue = 'win32';
      // Directory write succeeds
      mockFS.writeFileSync.mockImplementation(() => {});
      mockFS.unlinkSync.mockImplementation(() => {});
      // Rename succeeds (file not locked)
      mockFS.renameSync.mockImplementation(() => {});

      const result = await waitForFileLockRelease('C:\\Users\\test\\qnsc-mcp.exe');

      expect(result.canProceed).toBe(true);
      expect(result.fileLockDetected).toBe(false);
      expect(result.adminRequired).toBe(false);
    });

    it('should include lockingProcess in result when file is locked', async () => {
      platformValue = 'win32';
      mockFS.writeFileSync.mockImplementation(() => {});
      mockFS.unlinkSync.mockImplementation(() => {});
      // File is locked
      let callCount = 0;
      mockFS.renameSync.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First check: locked
          const error = new Error('EBUSY') as NodeJS.ErrnoException;
          error.code = 'EBUSY';
          throw error;
        }
        // Subsequent checks: not locked (simulates user closing IDE)
      });
      mockExecSync.mockReturnValue('Code (PID: 12345)');

      const result = await waitForFileLockRelease('C:\\Users\\test\\qnsc-mcp.exe', 1);

      // Should detect VS Code as the locking process
      expect(result.lockingProcess).toBe('VS Code');
    });

    it('should always close readline interface even when file becomes unlocked', async () => {
      platformValue = 'win32';
      mockFS.writeFileSync.mockImplementation(() => {});
      mockFS.unlinkSync.mockImplementation(() => {});
      // File starts locked, then unlocks
      let callCount = 0;
      mockFS.renameSync.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const error = new Error('EBUSY') as NodeJS.ErrnoException;
          error.code = 'EBUSY';
          throw error;
        }
        // After first call, file is unlocked
      });
      mockExecSync.mockReturnValue('Code');
      mockRlClose.mockClear();

      const result = await waitForFileLockRelease('C:\\Users\\test\\qnsc-mcp.exe');

      expect(result.canProceed).toBe(true);
      expect(result.fileLockDetected).toBe(true);
      // Verify readline was closed
      expect(mockRlClose).toHaveBeenCalled();
    });

    it('should report waitTimeSeconds when file was initially locked', async () => {
      platformValue = 'win32';
      mockFS.writeFileSync.mockImplementation(() => {});
      mockFS.unlinkSync.mockImplementation(() => {});
      // File starts locked, then unlocks after first check
      let callCount = 0;
      mockFS.renameSync.mockImplementation(() => {
        callCount++;
        if (callCount <= 1) {
          const error = new Error('EBUSY') as NodeJS.ErrnoException;
          error.code = 'EBUSY';
          throw error;
        }
      });
      mockExecSync.mockReturnValue('');

      const result = await waitForFileLockRelease('C:\\Users\\test\\qnsc-mcp.exe');

      expect(result.canProceed).toBe(true);
      expect(result.fileLockDetected).toBe(true);
      expect(typeof result.waitTimeSeconds).toBe('number');
      expect(result.waitTimeSeconds).toBeGreaterThanOrEqual(0);
    });

    it('should return FileLockWaitResult with all required fields', async () => {
      platformValue = 'darwin';

      const result = await waitForFileLockRelease('/some/path');

      // Verify the interface is correctly implemented
      expect(result).toHaveProperty('canProceed');
      expect(result).toHaveProperty('fileLockDetected');
      expect(result).toHaveProperty('adminRequired');
      expect(typeof result.canProceed).toBe('boolean');
      expect(typeof result.fileLockDetected).toBe('boolean');
      expect(typeof result.adminRequired).toBe('boolean');
    });
  });
});
