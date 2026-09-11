import { describe, it, expect, beforeEach, spyOn } from 'bun:test';
import * as fs from 'fs';
import {
  mockSudoExec,
  mockExec,
  resetInstallerMocks,
} from './test-utils/mocks';
import { installWindows, installUnix, addToUnixPath, type PlatformInstallConfig } from './platform-install';

describe('platform-install', () => {
  beforeEach(() => {
    resetInstallerMocks();
  });

  describe('installWindows', () => {
    /**
     * Helper to decode the Base64 UTF-16LE encoded PowerShell script
     */
    function decodeEncodedCommand(command: string): string {
      const match = command.match(/-EncodedCommand\s+(\S+)/);
      if (!match) return '';
      const base64 = match[1];
      return Buffer.from(base64, 'base64').toString('utf16le');
    }

    it('executes PowerShell commands with sudo using -EncodedCommand', async () => {
      let capturedCommand = '';
      mockSudoExec.mockImplementation((cmd: string, options: any, callback: (error?: Error) => void) => {
        capturedCommand = cmd;
        callback();
      });

      await installWindows('/tmp/binary', 'C:\\Program Files\\QNSC-MCP', 'C:\\Program Files\\QNSC-MCP\\qnsc-mcp.exe', false);

      expect(capturedCommand).toContain('powershell.exe');
      expect(capturedCommand).toContain('-EncodedCommand');

      // Decode and verify the actual script content
      const decodedScript = decodeEncodedCommand(capturedCommand);
      expect(decodedScript).toContain('Copy-Item');
      expect(mockSudoExec).toHaveBeenCalledTimes(1);
    });

    it('includes PATH modification when addToPath is true', async () => {
      let capturedCommand = '';
      mockSudoExec.mockImplementation((cmd: string, options: any, callback: (error?: Error) => void) => {
        capturedCommand = cmd;
        callback();
      });

      await installWindows('/tmp/binary', 'C:\\Program Files\\QNSC-MCP', 'C:\\Program Files\\QNSC-MCP\\qnsc-mcp.exe', true);

      // Decode and verify PATH modification is included
      const decodedScript = decodeEncodedCommand(capturedCommand);
      expect(decodedScript).toContain('Set-ItemProperty -Path $regPath -Name PATH');
      expect(decodedScript).toContain('WM_SETTINGCHANGE');
    });

    it('rejects when sudo fails', async () => {
      mockSudoExec.mockImplementation((cmd: string, options: any, callback: (error?: Error) => void) => {
        callback(new Error('User cancelled'));
      });

      try {
        await installWindows('/tmp/binary', 'C:\\Program Files\\QNSC-MCP', 'C:\\Program Files\\QNSC-MCP\\qnsc-mcp.exe', false);
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('Installation failed');
        expect(error.message).toContain('User cancelled');
      }
    });

    it('rejects paths with dangerous characters', async () => {
      // Path with potentially dangerous characters
      try {
        await installWindows('/tmp/binary', "C:\\Program Files\\QNSC-MCP'; rm -rf /", 'C:\\target.exe', false);
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('Invalid characters in path');
      }
    });
  });

  describe('installUnix', () => {
    const mockConfig: PlatformInstallConfig = {
      platform: 'darwin',
      getShellProfilePath: () => '/home/user/.zshrc',
    };

    it('executes shell commands without sudo for user directories', async () => {
      mockExec.mockImplementation((cmd: string, callback: (error: Error | null) => void) => {
        callback(null);
      });

      await installUnix('/tmp/binary', '/home/user/bin', '/home/user/bin/qnsc-mcp', false, mockConfig);

      expect(mockExec).toHaveBeenCalledTimes(1);
      expect(mockSudoExec).not.toHaveBeenCalled();
    });

    it('uses sudo for /usr directories', async () => {
      mockSudoExec.mockImplementation((cmd: string, options: any, callback: (error?: Error) => void) => {
        callback();
      });

      await installUnix('/tmp/binary', '/usr/local/bin', '/usr/local/bin/qnsc-mcp', false, mockConfig);

      expect(mockSudoExec).toHaveBeenCalledTimes(1);
      expect(mockExec).not.toHaveBeenCalled();
    });

    it('uses sudo for /opt directories', async () => {
      mockSudoExec.mockImplementation((cmd: string, options: any, callback: (error?: Error) => void) => {
        callback();
      });

      await installUnix('/tmp/binary', '/opt/qnsc-mcp', '/opt/qnsc-mcp/qnsc-mcp', false, mockConfig);

      expect(mockSudoExec).toHaveBeenCalledTimes(1);
    });

    it('includes quarantine removal on macOS', async () => {
      let capturedCommand = '';
      mockExec.mockImplementation((cmd: string, callback: (error: Error | null) => void) => {
        capturedCommand = cmd;
        callback(null);
      });

      await installUnix('/tmp/binary', '/home/user/bin', '/home/user/bin/qnsc-mcp', false, mockConfig);

      expect(capturedCommand).toContain('xattr -d com.apple.quarantine');
    });

    it('does not include quarantine removal on Linux', async () => {
      const linuxConfig: PlatformInstallConfig = {
        platform: 'linux',
        getShellProfilePath: () => '/home/user/.bashrc',
      };

      let capturedCommand = '';
      mockExec.mockImplementation((cmd: string, callback: (error: Error | null) => void) => {
        capturedCommand = cmd;
        callback(null);
      });

      await installUnix('/tmp/binary', '/home/user/bin', '/home/user/bin/qnsc-mcp', false, linuxConfig);

      expect(capturedCommand).not.toContain('xattr');
    });

    it('rejects when exec fails', async () => {
      mockExec.mockImplementation((cmd: string, callback: (error: Error | null) => void) => {
        callback(new Error('Permission denied'));
      });

      try {
        await installUnix('/tmp/binary', '/home/user/bin', '/home/user/bin/qnsc-mcp', false, mockConfig);
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('Installation failed');
      }
    });
  });

  describe('addToUnixPath', () => {
    it('appends PATH export to profile file', () => {
      const existsSpy = spyOn(fs, 'existsSync').mockReturnValue(true);
      const readSpy = spyOn(fs, 'readFileSync').mockReturnValue('# existing content\n');
      const appendSpy = spyOn(fs, 'appendFileSync').mockImplementation(() => {});

      addToUnixPath('/usr/local/bin', '/home/user/.zshrc');

      expect(appendSpy).toHaveBeenCalledTimes(1);
      const appendedContent = appendSpy.mock.calls[0][1] as string;
      expect(appendedContent).toContain('export PATH="$PATH:/usr/local/bin"');
      expect(appendedContent).toContain('Added by QNSC-MCP Installer');

      existsSpy.mockRestore();
      readSpy.mockRestore();
      appendSpy.mockRestore();
    });

    it('does not append if path already in profile', () => {
      const existsSpy = spyOn(fs, 'existsSync').mockReturnValue(true);
      const readSpy = spyOn(fs, 'readFileSync').mockReturnValue('export PATH="$PATH:/usr/local/bin"\n');
      const appendSpy = spyOn(fs, 'appendFileSync').mockImplementation(() => {});

      addToUnixPath('/usr/local/bin', '/home/user/.zshrc');

      expect(appendSpy).not.toHaveBeenCalled();

      existsSpy.mockRestore();
      readSpy.mockRestore();
      appendSpy.mockRestore();
    });

    it('creates profile file content if file does not exist', () => {
      const existsSpy = spyOn(fs, 'existsSync').mockReturnValue(false);
      const appendSpy = spyOn(fs, 'appendFileSync').mockImplementation(() => {});

      addToUnixPath('/custom/bin', '/home/user/.bashrc');

      expect(appendSpy).toHaveBeenCalledTimes(1);

      existsSpy.mockRestore();
      appendSpy.mockRestore();
    });

    it('handles errors gracefully', () => {
      const existsSpy = spyOn(fs, 'existsSync').mockReturnValue(true);
      const readSpy = spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('Read error');
      });
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

      // Should not throw
      addToUnixPath('/usr/local/bin', '/home/user/.zshrc');

      expect(warnSpy).toHaveBeenCalled();

      existsSpy.mockRestore();
      readSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });
});
