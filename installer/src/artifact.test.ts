import { describe, it, expect, spyOn, mock, beforeEach } from 'bun:test';
import * as https from 'https';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';
import {
  createMockHttpResponse,
  createMockHttpRequest,
  mockSpawn,
} from './test-utils/mocks';
import {
  getArtifactInfo,
  escapePowerShellPath,
  downloadArtifact,
  fetchArtifactChecksum,
} from './artifact';

describe('artifact', () => {
  describe('getArtifactInfo', () => {
    it('finds binary and checksum artifacts for valid run', async () => {
      const artifactsData = {
        artifacts: [
          { id: 123, name: 'qnsc-mcp-macos-arm64', expired: false },
          { id: 456, name: 'qnsc-mcp-macos-arm64.sha256', expired: false },
          { id: 789, name: 'other-artifact', expired: false },
        ],
      };

      const mockResponse = createMockHttpResponse(200);
      const mockRequest = createMockHttpRequest();

      const requestSpy = spyOn(https, 'request').mockImplementation((options: any, callback: any) => {
        setTimeout(() => {
          callback(mockResponse);
          mockResponse.emit('data', JSON.stringify(artifactsData));
          mockResponse.emit('end');
        }, 0);
        return mockRequest;
      });

      const config = { binaryName: 'qnsc-mcp-macos-arm64', defaultInstallPath: '/usr/local/bin', requiresElevation: true };
      const result = await getArtifactInfo('12345', 'test-token', config);

      expect(result.binaryArtifactId).toBe(123);
      expect(result.binaryArtifactName).toBe('qnsc-mcp-macos-arm64');
      expect(result.checksumArtifactId).toBe(456);
      expect(result.checksumArtifactName).toBe('qnsc-mcp-macos-arm64.sha256');

      requestSpy.mockRestore();
    });

    it('rejects when binary artifact not found', async () => {
      const artifactsData = {
        artifacts: [
          { id: 123, name: 'other-artifact', expired: false },
        ],
      };

      const mockResponse = createMockHttpResponse(200);
      const mockRequest = createMockHttpRequest();

      const requestSpy = spyOn(https, 'request').mockImplementation((options: any, callback: any) => {
        setTimeout(() => {
          callback(mockResponse);
          mockResponse.emit('data', JSON.stringify(artifactsData));
          mockResponse.emit('end');
        }, 0);
        return mockRequest;
      });

      const config = { binaryName: 'qnsc-mcp-macos-arm64', defaultInstallPath: '/usr/local/bin', requiresElevation: true };

      try {
        await getArtifactInfo('12345', 'test-token', config);
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain('not found in workflow run');
        expect(error.message).toContain('other-artifact');
      }

      requestSpy.mockRestore();
    });

    it('rejects when artifact has expired', async () => {
      const artifactsData = {
        artifacts: [
          { id: 123, name: 'qnsc-mcp-macos-arm64', expired: true },
        ],
      };

      const mockResponse = createMockHttpResponse(200);
      const mockRequest = createMockHttpRequest();

      const requestSpy = spyOn(https, 'request').mockImplementation((options: any, callback: any) => {
        setTimeout(() => {
          callback(mockResponse);
          mockResponse.emit('data', JSON.stringify(artifactsData));
          mockResponse.emit('end');
        }, 0);
        return mockRequest;
      });

      const config = { binaryName: 'qnsc-mcp-macos-arm64', defaultInstallPath: '/usr/local/bin', requiresElevation: true };

      try {
        await getArtifactInfo('12345', 'test-token', config);
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain('expired');
        expect(error.message).toContain('7-day retention');
      }

      requestSpy.mockRestore();
    });

    it('handles missing checksum artifact gracefully', async () => {
      const artifactsData = {
        artifacts: [
          { id: 123, name: 'qnsc-mcp-macos-arm64', expired: false },
          // No checksum artifact
        ],
      };

      const mockResponse = createMockHttpResponse(200);
      const mockRequest = createMockHttpRequest();

      const requestSpy = spyOn(https, 'request').mockImplementation((options: any, callback: any) => {
        setTimeout(() => {
          callback(mockResponse);
          mockResponse.emit('data', JSON.stringify(artifactsData));
          mockResponse.emit('end');
        }, 0);
        return mockRequest;
      });

      const config = { binaryName: 'qnsc-mcp-macos-arm64', defaultInstallPath: '/usr/local/bin', requiresElevation: true };
      const result = await getArtifactInfo('12345', 'test-token', config);

      expect(result.binaryArtifactId).toBe(123);
      expect(result.checksumArtifactId).toBeNull();
      expect(result.checksumArtifactName).toBeNull();

      requestSpy.mockRestore();
    });

    it('rejects on non-200 status', async () => {
      const mockResponse = createMockHttpResponse(404);
      const mockRequest = createMockHttpRequest();

      const requestSpy = spyOn(https, 'request').mockImplementation((options: any, callback: any) => {
        setTimeout(() => {
          callback(mockResponse);
          mockResponse.emit('data', 'Not Found');
          mockResponse.emit('end');
        }, 0);
        return mockRequest;
      });

      const config = { binaryName: 'qnsc-mcp-macos-arm64', defaultInstallPath: '/usr/local/bin', requiresElevation: true };

      try {
        await getArtifactInfo('12345', 'test-token', config);
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain('HTTP 404');
      }

      requestSpy.mockRestore();
    });

    it('includes auth header with token', async () => {
      const artifactsData = {
        artifacts: [
          { id: 123, name: 'qnsc-mcp-macos-arm64', expired: false },
        ],
      };

      let capturedOptions: any;
      const mockResponse = createMockHttpResponse(200);
      const mockRequest = createMockHttpRequest();

      const requestSpy = spyOn(https, 'request').mockImplementation((options: any, callback: any) => {
        capturedOptions = options;
        setTimeout(() => {
          callback(mockResponse);
          mockResponse.emit('data', JSON.stringify(artifactsData));
          mockResponse.emit('end');
        }, 0);
        return mockRequest;
      });

      const config = { binaryName: 'qnsc-mcp-macos-arm64', defaultInstallPath: '/usr/local/bin', requiresElevation: true };
      await getArtifactInfo('12345', 'my-secret-token', config);

      expect(capturedOptions.headers.Authorization).toBe('token my-secret-token');
      expect(capturedOptions.path).toContain('/actions/runs/12345/artifacts');

      requestSpy.mockRestore();
    });

    it('handles empty artifacts list', async () => {
      const artifactsData = {
        artifacts: [],
      };

      const mockResponse = createMockHttpResponse(200);
      const mockRequest = createMockHttpRequest();

      const requestSpy = spyOn(https, 'request').mockImplementation((options: any, callback: any) => {
        setTimeout(() => {
          callback(mockResponse);
          mockResponse.emit('data', JSON.stringify(artifactsData));
          mockResponse.emit('end');
        }, 0);
        return mockRequest;
      });

      const config = { binaryName: 'qnsc-mcp-macos-arm64', defaultInstallPath: '/usr/local/bin', requiresElevation: true };

      try {
        await getArtifactInfo('12345', 'test-token', config);
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain('not found');
        expect(error.message).toContain('none');
      }

      requestSpy.mockRestore();
    });
  });

  describe('escapePowerShellPath', () => {
    it('returns path unchanged when no single quotes', () => {
      expect(escapePowerShellPath('C:\\Program Files\\QNSC-MCP')).toBe('C:\\Program Files\\QNSC-MCP');
      expect(escapePowerShellPath('/usr/local/bin')).toBe('/usr/local/bin');
    });

    it('escapes single quotes by doubling them', () => {
      expect(escapePowerShellPath("C:\\User's Files")).toBe("C:\\User''s Files");
      expect(escapePowerShellPath("path'with'quotes")).toBe("path''with''quotes");
    });

    it('escapes multiple consecutive single quotes', () => {
      expect(escapePowerShellPath("path'''test")).toBe("path''''''test");
    });

    it('handles empty string', () => {
      expect(escapePowerShellPath('')).toBe('');
    });

    it('handles path that is just a single quote', () => {
      expect(escapePowerShellPath("'")).toBe("''");
    });

    it('handles paths with spaces and special Windows characters', () => {
      expect(escapePowerShellPath("C:\\Users\\John's PC\\Documents")).toBe("C:\\Users\\John''s PC\\Documents");
    });

    it('handles already escaped quotes (idempotency check)', () => {
      // If someone accidentally passes already-escaped quotes, we still escape them
      expect(escapePowerShellPath("path''test")).toBe("path''''test");
    });
  });

  // Note: downloadArtifact and fetchArtifactChecksum tests are complex due to
  // their reliance on multiple async operations (HTTP requests, file system, spawning).
  // The core logic is tested through:
  // 1. escapePowerShellPath tests (for PowerShell escaping safety)
  // 2. getArtifactInfo tests (for artifact discovery)
  // 3. utils.test.ts tests for downloadFile, httpsGet, getRedirectUrl
  //
  // Integration testing of these functions should be done via manual testing
  // or end-to-end tests rather than unit tests with complex mocking.
});
