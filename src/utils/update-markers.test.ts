import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mockFS, mockOs } from '../test-utils/mocks';

import {
  checkUpdateResult,
  FAILURE_MARKER,
  isMarkerStale,
  MARKER_DIR,
  SUCCESS_MARKER,
} from './update-markers';

// Platform control
let platformValue = 'darwin';
mockOs.platform.mockImplementation(() => platformValue);

describe('update-markers', () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    mockFS.existsSync.mockClear();
    mockFS.statSync.mockClear();
    mockFS.readFileSync.mockClear();
    mockFS.unlinkSync.mockClear();
    platformValue = 'darwin';
  });

  describe('isMarkerStale', () => {
    it('should return true for markers older than 24 hours', () => {
      const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;
      mockFS.statSync.mockReturnValue({
        mtimeMs: twentyFiveHoursAgo,
        isDirectory: () => false,
      });

      const result = isMarkerStale('/some/marker');

      expect(result).toBe(true);
    });

    it('should return false for markers less than 24 hours old', () => {
      const oneHourAgo = Date.now() - 1 * 60 * 60 * 1000;
      mockFS.statSync.mockReturnValue({
        mtimeMs: oneHourAgo,
        isDirectory: () => false,
      });

      const result = isMarkerStale('/some/marker');

      expect(result).toBe(false);
    });

    it('should return false on errors', () => {
      mockFS.statSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const result = isMarkerStale('/some/marker');

      expect(result).toBe(false);
    });
  });

  describe('checkUpdateResult', () => {
    it('should do nothing on non-Windows platforms', () => {
      platformValue = 'darwin';

      checkUpdateResult();

      expect(mockFS.existsSync).not.toHaveBeenCalledWith(
        expect.stringContaining('.qnscmcp-update-success'),
      );
    });

    it('should display success message when success marker exists on Windows', () => {
      platformValue = 'win32';
      const oneHourAgo = Date.now() - 1 * 60 * 60 * 1000;

      mockFS.existsSync.mockImplementation((path: string) => {
        return path.includes('.qnscmcp-update-success');
      });
      mockFS.statSync.mockReturnValue({
        mtimeMs: oneHourAgo,
        isDirectory: () => false,
      });
      mockFS.readFileSync.mockReturnValue('2024-01-15 10:30:00');
      mockFS.unlinkSync.mockImplementation(() => {});

      checkUpdateResult();

      const logCalls = consoleLogSpy.mock.calls.map((call: any[]) => call[0]);
      const hasSuccessMessage = logCalls.some(
        (call: string) =>
          call && typeof call === 'string' && call.includes('Update completed successfully'),
      );
      expect(hasSuccessMessage).toBe(true);
      expect(mockFS.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('.qnscmcp-update-success'),
      );
    });

    it('should display failure message when failure marker exists on Windows', () => {
      platformValue = 'win32';
      const oneHourAgo = Date.now() - 1 * 60 * 60 * 1000;

      mockFS.existsSync.mockImplementation((path: string) => {
        return path.includes('.qnscmcp-update-failed');
      });
      mockFS.statSync.mockReturnValue({
        mtimeMs: oneHourAgo,
        isDirectory: () => false,
      });
      mockFS.readFileSync.mockReturnValue(
        'Update failed at 2024-01-15. Check log at: /tmp/log.txt',
      );
      mockFS.unlinkSync.mockImplementation(() => {});

      checkUpdateResult();

      const logCalls = consoleLogSpy.mock.calls.map((call: any[]) => call[0]);
      const hasFailureMessage = logCalls.some(
        (call: string) =>
          call && typeof call === 'string' && call.includes('Previous update failed'),
      );
      expect(hasFailureMessage).toBe(true);
      expect(mockFS.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('.qnscmcp-update-failed'),
      );
    });

    it('should do nothing when no marker files exist on Windows', () => {
      platformValue = 'win32';

      mockFS.existsSync.mockReturnValue(false);

      checkUpdateResult();

      const logCalls = consoleLogSpy.mock.calls.map((call: any[]) => call[0]);
      const hasUpdateMessage = logCalls.some(
        (call: string) =>
          call &&
          typeof call === 'string' &&
          (call.includes('Update completed') || call.includes('update failed')),
      );
      expect(hasUpdateMessage).toBe(false);
    });

    it('should silently clean up stale success markers (>24h old)', () => {
      platformValue = 'win32';
      const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;

      mockFS.existsSync.mockImplementation((path: string) => {
        return path.includes('.qnscmcp-update-success');
      });
      mockFS.statSync.mockReturnValue({
        mtimeMs: twentyFiveHoursAgo,
        isDirectory: () => false,
      });
      mockFS.unlinkSync.mockImplementation(() => {});

      checkUpdateResult();

      expect(mockFS.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('.qnscmcp-update-success'),
      );

      // Should NOT have logged any success message
      const logCalls = consoleLogSpy.mock.calls.map((call: any[]) => call[0]);
      const hasSuccessMessage = logCalls.some(
        (call: string) =>
          call && typeof call === 'string' && call.includes('Update completed successfully'),
      );
      expect(hasSuccessMessage).toBe(false);
    });

    it('should silently clean up stale failure markers (>24h old)', () => {
      platformValue = 'win32';
      const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;

      mockFS.existsSync.mockImplementation((path: string) => {
        return path.includes('.qnscmcp-update-failed');
      });
      mockFS.statSync.mockReturnValue({
        mtimeMs: twentyFiveHoursAgo,
        isDirectory: () => false,
      });
      mockFS.unlinkSync.mockImplementation(() => {});

      checkUpdateResult();

      expect(mockFS.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('.qnscmcp-update-failed'),
      );

      // Should NOT have logged any failure message
      const logCalls = consoleLogSpy.mock.calls.map((call: any[]) => call[0]);
      const hasFailureMessage = logCalls.some(
        (call: string) =>
          call && typeof call === 'string' && call.includes('Previous update failed'),
      );
      expect(hasFailureMessage).toBe(false);
    });

    it('should handle errors gracefully when reading marker files', () => {
      platformValue = 'win32';

      mockFS.existsSync.mockImplementation(() => {
        throw new Error('File system error');
      });

      expect(() => checkUpdateResult()).not.toThrow();
    });
  });

  describe('marker constants', () => {
    it('should export SUCCESS_MARKER path', () => {
      expect(SUCCESS_MARKER).toContain('.qnscmcp-update-success');
    });

    it('should export FAILURE_MARKER path', () => {
      expect(FAILURE_MARKER).toContain('.qnscmcp-update-failed');
    });

    it('should export MARKER_DIR', () => {
      expect(MARKER_DIR).toBeDefined();
    });
  });
});
