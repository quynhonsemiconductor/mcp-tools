import { describe, it, expect, spyOn } from 'bun:test';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as https from 'https';
import {
  createMockHttpResponse,
  createMockHttpRequest,
} from './test-utils/mocks';
import {
  getLatestRelease,
  fetchExpectedChecksum,
  verifyChecksum,
} from './release';

describe('release', () => {
  describe('getLatestRelease', () => {
    it('fetches and parses release info successfully', async () => {
      const releaseData = {
        tag_name: 'v1.2.3',
        assets: [
          { name: 'qnsc-mcp-darwin-arm64', url: 'https://api.github.com/asset/123' },
          { name: 'qnsc-mcp-darwin-arm64.sha256', url: 'https://api.github.com/asset/456' },
        ],
      };

      const mockResponse = createMockHttpResponse(200);
      const mockRequest = createMockHttpRequest();

      const requestSpy = spyOn(https, 'request').mockImplementation((options: any, callback: any) => {
        setTimeout(() => {
          callback(mockResponse);
          mockResponse.emit('data', JSON.stringify(releaseData));
          mockResponse.emit('end');
        }, 0);
        return mockRequest;
      });

      const config = { binaryName: 'qnsc-mcp-darwin-arm64', defaultInstallPath: '/usr/local/bin', requiresElevation: true };
      const result = await getLatestRelease('test-token', config);

      expect(result.tagName).toBe('v1.2.3');
      expect(result.downloadUrl).toBe('https://api.github.com/asset/123');
      expect(result.checksumUrl).toBe('https://api.github.com/asset/456');

      requestSpy.mockRestore();
    });

    it('rejects when binary not found in release', async () => {
      const releaseData = {
        tag_name: 'v1.2.3',
        assets: [
          { name: 'other-binary', url: 'https://api.github.com/asset/123' },
        ],
      };

      const mockResponse = createMockHttpResponse(200);
      const mockRequest = createMockHttpRequest();

      const requestSpy = spyOn(https, 'request').mockImplementation((options: any, callback: any) => {
        setTimeout(() => {
          callback(mockResponse);
          mockResponse.emit('data', JSON.stringify(releaseData));
          mockResponse.emit('end');
        }, 0);
        return mockRequest;
      });

      const config = { binaryName: 'qnsc-mcp-darwin-arm64', defaultInstallPath: '/usr/local/bin', requiresElevation: true };

      try {
        await getLatestRelease('test-token', config);
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('not found in release');
      }

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

      const config = { binaryName: 'qnsc-mcp-darwin-arm64', defaultInstallPath: '/usr/local/bin', requiresElevation: true };

      try {
        await getLatestRelease('test-token', config);
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('HTTP 404');
      }

      requestSpy.mockRestore();
    });

    it('includes auth header when token provided', async () => {
      const releaseData = {
        tag_name: 'v1.0.0',
        assets: [{ name: 'qnsc-mcp-darwin-arm64', url: 'https://example.com' }],
      };

      let capturedOptions: any;
      const mockResponse = createMockHttpResponse(200);
      const mockRequest = createMockHttpRequest();

      const requestSpy = spyOn(https, 'request').mockImplementation((options: any, callback: any) => {
        capturedOptions = options;
        setTimeout(() => {
          callback(mockResponse);
          mockResponse.emit('data', JSON.stringify(releaseData));
          mockResponse.emit('end');
        }, 0);
        return mockRequest;
      });

      const config = { binaryName: 'qnsc-mcp-darwin-arm64', defaultInstallPath: '/usr/local/bin', requiresElevation: true };
      await getLatestRelease('my-secret-token', config);

      expect(capturedOptions.headers.Authorization).toBe('token my-secret-token');

      requestSpy.mockRestore();
    });
  });

  describe('fetchExpectedChecksum', () => {
    it('returns checksum on success', async () => {
      const expectedChecksum = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
      const checksumContent = `${expectedChecksum}  qnsc-mcp-darwin-arm64`;

      const mockResponse = createMockHttpResponse(200);
      const mockRequest = createMockHttpRequest();

      const requestSpy = spyOn(https, 'request').mockImplementation((options: any, callback: any) => {
        setTimeout(() => {
          callback(mockResponse);
          mockResponse.emit('data', checksumContent);
          mockResponse.emit('end');
        }, 0);
        return mockRequest;
      });

      const result = await fetchExpectedChecksum('https://example.com/checksum', 'token');

      expect(result.checksum).toBe(expectedChecksum);
      expect(result.warning).toBeUndefined();

      requestSpy.mockRestore();
    });

    it('returns warning on non-200 status', async () => {
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

      const result = await fetchExpectedChecksum('https://example.com/checksum', 'token');

      expect(result.checksum).toBeNull();
      expect(result.warning).toContain('HTTP 404');

      requestSpy.mockRestore();
    });

    it('follows redirects', async () => {
      const expectedChecksum = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
      let callCount = 0;

      const mockRequest = createMockHttpRequest();

      const requestSpy = spyOn(https, 'request').mockImplementation((options: any, callback: any) => {
        callCount++;

        if (callCount === 1) {
          // Use an allowed redirect host (GitHub CDN)
          const mockResponse = createMockHttpResponse(302, { location: 'https://objects.githubusercontent.com/checksum' });
          setTimeout(() => {
            callback(mockResponse);
            mockResponse.emit('end');
          }, 0);
        } else {
          const mockResponse = createMockHttpResponse(200);
          setTimeout(() => {
            callback(mockResponse);
            mockResponse.emit('data', `${expectedChecksum}  file`);
            mockResponse.emit('end');
          }, 0);
        }
        return mockRequest;
      });

      const result = await fetchExpectedChecksum('https://example.com/checksum', 'token');

      expect(result.checksum).toBe(expectedChecksum);
      expect(callCount).toBe(2);

      requestSpy.mockRestore();
    });
  });

  describe('verifyChecksum', () => {
    it('throws when expected checksum is null', async () => {
      try {
        await verifyChecksum('/path/to/file', null);
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('Checksum file missing');
      }
    });

    it('throws when checksums do not match', async () => {
      const mockStream = new EventEmitter() as any;
      const createReadStreamSpy = spyOn(fs, 'createReadStream').mockReturnValue(mockStream as any);

      const verifyPromise = verifyChecksum('/path/to/file', 'expectedhash123');

      // Emit data and end
      setTimeout(() => {
        mockStream.emit('data', Buffer.from('file content'));
        mockStream.emit('end');
      }, 0);

      try {
        await verifyPromise;
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('Checksum verification failed');
      }

      createReadStreamSpy.mockRestore();
    });

    it('succeeds when checksums match', async () => {
      const fileContent = 'test file content';
      const expectedHash = crypto.createHash('sha256').update(fileContent).digest('hex');

      const mockStream = new EventEmitter() as any;
      const createReadStreamSpy = spyOn(fs, 'createReadStream').mockReturnValue(mockStream as any);

      const verifyPromise = verifyChecksum('/path/to/file', expectedHash);

      setTimeout(() => {
        mockStream.emit('data', Buffer.from(fileContent));
        mockStream.emit('end');
      }, 0);

      await verifyPromise; // Should not throw
      createReadStreamSpy.mockRestore();
    });
  });
});
