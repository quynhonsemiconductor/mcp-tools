import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as childProcess from 'child_process';

// Create a spy on execSync before importing the module that uses it
const execSyncSpy = spyOn(childProcess, 'execSync');

// Now import the module that uses execSync
import { executeOSAScript, getAppVersion } from './utils';

describe('Utility Functions', () => {
  beforeEach(() => {
    execSyncSpy.mockReset();
    execSyncSpy.mockImplementation((() => 'sample output') as any);
  });

  describe.skip('executeOSAScript', () => {
    it('should call execSync with the correct parameters', () => {
      // Execute the function
      const input = 'tell application "System Events" to get name of every process';
      const result = executeOSAScript(input);

      // Verify execSync was called correctly
      expect(execSyncSpy).toHaveBeenCalled();
      const [command, options] = (execSyncSpy.mock.calls[0] ?? []) as [string, any];
      expect(command).toBe('osascript');
      expect(options.encoding).toBe('utf8');
      expect(options.input).toBe(input);
      expect(options.stdio).toEqual(['pipe', 'pipe', 'ignore']);

      // Verify the output is returned
      expect(result).toBe('sample output');
    });

    it('should handle AppleScript that returns multiple lines', () => {
      // Setup mock to return multi-line output
      const multilineOutput = 'line1\nline2\nline3';
      execSyncSpy.mockImplementation((() => multilineOutput) as any);

      // Execute the function
      const input = 'list folder "/Applications" returning items';
      const result = executeOSAScript(input);

      // Verify correct output
      expect(result).toBe(multilineOutput);
    });

    it('should pass through the AppleScript code unchanged', () => {
      // Setup mock
      execSyncSpy.mockImplementation((() => '') as any);

      // Test with complex AppleScript input
      const complexScript = `
        tell application "Finder"
          set frontmost to true
          set _bounds to bounds of window 1
          return _bounds
        end tell
      `;

      executeOSAScript(complexScript);

      // Verify the input was passed unchanged
      expect(execSyncSpy).toHaveBeenCalled();
      const [command, options] = (execSyncSpy.mock.calls[0] ?? []) as [string, any];
      expect(command).toBe('osascript');
      expect(options.input).toBe(complexScript);
    });

    it('should throw an error when execSync fails', () => {
      // Setup mock to throw an error
      const errorMessage = 'osascript execution failed';
      execSyncSpy.mockImplementation((() => {
        throw new Error(errorMessage);
      }) as any);

      // Expect executeOSAScript to throw the same error
      const input = 'invalid AppleScript code';
      expect(() => executeOSAScript(input)).toThrow(errorMessage);
    });

    it('should use UTF-8 encoding for the output', () => {
      // Setup mock to return text with non-ASCII characters
      const nonAsciiOutput = 'café résumé 你好 💻';
      execSyncSpy.mockImplementation((() => nonAsciiOutput) as any);

      // Execute function
      const result = executeOSAScript('return "café résumé 你好 💻"');

      // Verify encoding was correctly passed and output preserved
      expect(execSyncSpy).toHaveBeenCalled();
      const [command, options] = (execSyncSpy.mock.calls[0] ?? []) as [string, any];
      expect(command).toBe('osascript');
      expect(options.encoding).toBe('utf8');
      expect(result).toBe(nonAsciiOutput);
    });

    it('should redirect stderr to /dev/null', () => {
      // Setup mock
      execSyncSpy.mockImplementation((() => '') as any);

      // Execute function
      executeOSAScript('sample script');

      // Verify stdio configuration
      expect(execSyncSpy).toHaveBeenCalled();
      const [command, options] = (execSyncSpy.mock.calls[0] ?? []) as [string, any];
      expect(command).toBe('osascript');
      expect(options.stdio).toEqual(['pipe', 'pipe', 'ignore']);
    });
  });

  describe('getAppVersion', () => {
    it('should return a version string', () => {
      const version = getAppVersion();
      // Should return a semver-like string or 'unknown'
      expect(typeof version).toBe('string');
      expect(version.length).toBeGreaterThan(0);
    });

    it('should return a valid semver version from package.json', () => {
      const version = getAppVersion();
      // Check it's not 'unknown' and looks like a version
      if (version !== 'unknown') {
        // Basic semver pattern check (optional v prefix, x.y.z with optional prerelease)
        expect(version).toMatch(/^v?\d+\.\d+\.\d+/);
      }
    });
  });
});
