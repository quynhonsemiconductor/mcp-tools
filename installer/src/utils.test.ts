import { describe, it, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as https from 'https';
import {
  deobfuscate,
  getInstallConfig,
  sanitizePath,
  getShellProfilePath,
  parseDownloadUrl,
  parseChecksumFile,
  calculateBufferChecksum,
  verifyChecksumMatch,
  calculateFileChecksum,
  downloadFile,
  httpsGet,
  getRedirectUrl,
  isAllowedRedirectHost,
  GITHUB_API_HOST,
} from './utils';

describe('deobfuscate', () => {
  it('returns placeholder strings unchanged', () => {
    expect(deobfuscate('__PLACEHOLDER__', 'somekey')).toBe('__PLACEHOLDER__');
    expect(deobfuscate('__TEST_VALUE__', 'key')).toBe('__TEST_VALUE__');
  });

  it('returns encoded string if key is placeholder', () => {
    expect(deobfuscate('encodedvalue', '__KEY_PLACEHOLDER__')).toBe('encodedvalue');
  });

  it('correctly deobfuscates XOR-encoded data', () => {
    // Create a known XOR obfuscation
    const plaintext = 'secret-token';
    const key = Buffer.from('testkey12345678901234567890123456');
    const keyBase64 = key.toString('base64');

    // XOR obfuscate
    const data = Buffer.from(plaintext, 'utf-8');
    const obfuscated = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i++) {
      obfuscated[i] = data[i] ^ key[i % key.length];
    }
    const obfuscatedBase64 = obfuscated.toString('base64');

    // Verify deobfuscation
    expect(deobfuscate(obfuscatedBase64, keyBase64)).toBe(plaintext);
  });

  it('handles non-base64 input gracefully', () => {
    // When both encoded and key are valid-looking base64, XOR decoding happens
    // The function is designed to handle any input without crashing
    const result = deobfuscate('dGVzdA==', 'a2V5'); // 'test' XOR'd with 'key'
    expect(typeof result).toBe('string');
  });
});

describe('getInstallConfig', () => {
  it('returns correct config for Windows', () => {
    const config = getInstallConfig('win32', 'x64');
    expect(config.binaryName).toBe('qnsc-mcp-win-x64.exe');
    expect(config.defaultInstallPath).toBe('C:\\Program Files\\QNSC-MCP');
    expect(config.requiresElevation).toBe(true);
  });

  it('returns correct config for macOS x64', () => {
    const config = getInstallConfig('darwin', 'x64');
    expect(config.binaryName).toBe('qnsc-mcp-macos-x64');
    expect(config.defaultInstallPath).toBe('/usr/local/bin');
    expect(config.requiresElevation).toBe(true);
  });

  it('returns correct config for macOS arm64', () => {
    const config = getInstallConfig('darwin', 'arm64');
    expect(config.binaryName).toBe('qnsc-mcp-macos-arm64');
    expect(config.defaultInstallPath).toBe('/usr/local/bin');
  });

  it('returns correct config for Linux x64', () => {
    const config = getInstallConfig('linux', 'x64');
    expect(config.binaryName).toBe('qnsc-mcp-linux-x64');
    expect(config.defaultInstallPath).toBe('/usr/local/bin');
  });

  it('returns correct config for Linux arm64', () => {
    const config = getInstallConfig('linux', 'arm64');
    expect(config.binaryName).toBe('qnsc-mcp-linux-arm64');
  });

  it('throws for unsupported platform', () => {
    expect(() => getInstallConfig('freebsd' as NodeJS.Platform, 'x64')).toThrow(
      'Unsupported platform: freebsd'
    );
  });
});

describe('sanitizePath', () => {
  it('allows valid paths', () => {
    expect(sanitizePath('/usr/local/bin')).toBe('/usr/local/bin');
    expect(sanitizePath('C:\\Program Files\\QNSC-MCP')).toBe('C:\\Program Files\\QNSC-MCP');
    expect(sanitizePath('/home/user/my-app')).toBe('/home/user/my-app');
    expect(sanitizePath('/path/with spaces/file.txt')).toBe('/path/with spaces/file.txt');
    expect(sanitizePath('/path_with_underscores/and.dots')).toBe('/path_with_underscores/and.dots');
  });

  it('allows empty string (validation happens elsewhere)', () => {
    expect(sanitizePath('')).toBe('');
  });

  it('rejects paths with semicolons (command chaining)', () => {
    expect(() => sanitizePath('/path; rm -rf /')).toThrow('Invalid characters in path');
  });

  it('rejects paths with ampersands (command chaining)', () => {
    expect(() => sanitizePath('/path && echo hacked')).toThrow('Invalid characters in path');
  });

  it('rejects paths with pipes (command piping)', () => {
    expect(() => sanitizePath('/path | cat /etc/passwd')).toThrow('Invalid characters in path');
  });

  it('rejects paths with backticks (command substitution)', () => {
    expect(() => sanitizePath('/path/`whoami`')).toThrow('Invalid characters in path');
  });

  it('rejects paths with dollar signs (variable expansion)', () => {
    expect(() => sanitizePath('/path/$HOME')).toThrow('Invalid characters in path');
  });

  it('rejects paths with parentheses (subshell)', () => {
    expect(() => sanitizePath('/path/(subshell)')).toThrow('Invalid characters in path');
  });

  it('rejects paths with curly braces', () => {
    expect(() => sanitizePath('/path/{a,b}')).toThrow('Invalid characters in path');
  });

  it('rejects paths with quotes', () => {
    expect(() => sanitizePath('/path/"quoted"')).toThrow('Invalid characters in path');
    expect(() => sanitizePath("/path/'quoted'")).toThrow('Invalid characters in path');
  });

  it('rejects paths with newlines', () => {
    expect(() => sanitizePath('/path\n/newline')).toThrow('Invalid characters in path');
    expect(() => sanitizePath('/path\r/carriage')).toThrow('Invalid characters in path');
  });
});

describe('getShellProfilePath', () => {
  it('returns null for standard PATH locations', () => {
    expect(getShellProfilePath('/usr/local/bin')).toBeNull();
    expect(getShellProfilePath('/usr/bin')).toBeNull();
    expect(getShellProfilePath('/opt/homebrew/bin')).toBeNull();
  });

  it('returns .zshrc for zsh shell', () => {
    const result = getShellProfilePath('/custom/path', 'darwin', '/home/user', '/bin/zsh');
    expect(result).toBe('/home/user/.zshrc');
  });

  it('returns .bash_profile on macOS for bash', () => {
    const result = getShellProfilePath('/custom/path', 'darwin', '/home/user', '/bin/bash');
    expect(result).toBe('/home/user/.bash_profile');
  });

  it('returns .bash_profile on Linux if it exists', () => {
    const mockExistsSync = mock(() => true);
    const result = getShellProfilePath(
      '/custom/path',
      'linux',
      '/home/user',
      '/bin/bash',
      mockExistsSync
    );
    expect(result).toBe('/home/user/.bash_profile');
  });

  it('returns .bashrc on Linux if .bash_profile does not exist', () => {
    const mockExistsSync = mock(() => false);
    const result = getShellProfilePath(
      '/custom/path',
      'linux',
      '/home/user',
      '/bin/bash',
      mockExistsSync
    );
    expect(result).toBe('/home/user/.bashrc');
  });

  it('returns .profile for unknown shells', () => {
    const result = getShellProfilePath('/custom/path', 'linux', '/home/user', '/bin/fish');
    expect(result).toBe('/home/user/.profile');
  });
});

describe('parseDownloadUrl', () => {
  it('parses full URLs correctly', () => {
    const result = parseDownloadUrl('https://example.com/path/to/file?query=1');
    expect(result.hostname).toBe('example.com');
    expect(result.path).toBe('/path/to/file?query=1');
  });

  it('parses GitHub API URLs', () => {
    const url = `https://${GITHUB_API_HOST}/api/v3/repos/owner/repo/releases/assets/123`;
    const result = parseDownloadUrl(url);
    expect(result.hostname).toBe(GITHUB_API_HOST);
    expect(result.path).toBe('/api/v3/repos/owner/repo/releases/assets/123');
  });

  it('parses S3 redirect URLs', () => {
    const result = parseDownloadUrl(
      'https://github-cloud.s3.amazonaws.com/releases/12345/asset.zip?token=abc'
    );
    expect(result.hostname).toBe('github-cloud.s3.amazonaws.com');
    expect(result.path).toBe('/releases/12345/asset.zip?token=abc');
  });

  it('handles relative paths with https prefix using default host', () => {
    const url = `https://${GITHUB_API_HOST}/some/path`;
    const result = parseDownloadUrl(url);
    expect(result.hostname).toBe(GITHUB_API_HOST);
    expect(result.path).toBe('/some/path');
  });

  it('handles plain relative paths', () => {
    const result = parseDownloadUrl('/api/v3/repos/owner/repo');
    expect(result.hostname).toBe(GITHUB_API_HOST);
    expect(result.path).toBe('/api/v3/repos/owner/repo');
  });
});

describe('parseChecksumFile', () => {
  it('parses standard sha256sum format with two spaces', () => {
    const content = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2  qnsc-mcp-linux-x64';
    const result = parseChecksumFile(content);
    expect(result).toBe('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2');
  });

  it('parses format with single space', () => {
    const content = 'AABBCCDD11223344556677889900aabbccddeeff11223344556677889900aabb filename.exe';
    const result = parseChecksumFile(content);
    expect(result).toBe('aabbccdd11223344556677889900aabbccddeeff11223344556677889900aabb');
  });

  it('handles content with trailing newline', () => {
    const content = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef  binary\n';
    const result = parseChecksumFile(content);
    expect(result).toBe('deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
  });

  it('returns null for invalid format', () => {
    expect(parseChecksumFile('not a valid checksum')).toBeNull();
    expect(parseChecksumFile('tooshort  file')).toBeNull();
    expect(parseChecksumFile('')).toBeNull();
  });

  it('returns null for hash with wrong length', () => {
    // 63 characters (too short)
    expect(parseChecksumFile('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b  file')).toBeNull();
    // 65 characters (too long)
    expect(parseChecksumFile('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c  file')).toBeNull();
  });
});

describe('calculateBufferChecksum', () => {
  it('calculates correct SHA256 for known input', () => {
    // SHA256 of "hello world" is well-known
    const data = Buffer.from('hello world');
    const result = calculateBufferChecksum(data);
    expect(result).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('calculates correct SHA256 for empty buffer', () => {
    const data = Buffer.from('');
    const result = calculateBufferChecksum(data);
    // SHA256 of empty string
    expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('calculates correct SHA256 for binary data', () => {
    const data = Buffer.from([0x00, 0x01, 0x02, 0xff]);
    const result = calculateBufferChecksum(data);
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('verifyChecksumMatch', () => {
  it('returns true for matching checksums', () => {
    const checksum = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
    expect(verifyChecksumMatch(checksum, checksum)).toBe(true);
  });

  it('returns true for matching checksums with different case', () => {
    const lower = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
    const upper = 'A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2';
    expect(verifyChecksumMatch(lower, upper)).toBe(true);
    expect(verifyChecksumMatch(upper, lower)).toBe(true);
  });

  it('returns false for non-matching checksums', () => {
    const checksum1 = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
    const checksum2 = 'b1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
    expect(verifyChecksumMatch(checksum1, checksum2)).toBe(false);
  });
});

describe('calculateFileChecksum', () => {
  it('calculates correct SHA256 for a file', async () => {
    // Create a mock readable stream that emits known data
    const mockStream = new EventEmitter() as any;
    const createReadStreamSpy = spyOn(fs, 'createReadStream').mockReturnValue(mockStream as any);

    const checksumPromise = calculateFileChecksum('/test/file.bin');

    // Emit the data
    mockStream.emit('data', Buffer.from('hello world'));
    mockStream.emit('end');

    const result = await checksumPromise;
    // SHA256 of "hello world"
    expect(result).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    expect(createReadStreamSpy).toHaveBeenCalledWith('/test/file.bin');
  });

  it('rejects on stream error', async () => {
    const mockStream = new EventEmitter() as any;
    spyOn(fs, 'createReadStream').mockReturnValue(mockStream as any);

    const checksumPromise = calculateFileChecksum('/test/file.bin');

    mockStream.emit('error', new Error('File not found'));

    try {
      await checksumPromise;
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.message).toBe('File not found');
    }
  });
});

describe('httpsGet', () => {
  let mockRequest: any;
  let mockResponse: any;
  let requestSpy: any;

  beforeEach(() => {
    mockRequest = new EventEmitter() as any;
    mockRequest.setTimeout = mock(() => {});
    mockRequest.end = mock(() => {});
    mockRequest.destroy = mock(() => {});

    mockResponse = new EventEmitter() as any;
    mockResponse.statusCode = 200;
    mockResponse.headers = {};

    requestSpy = spyOn(https, 'request').mockImplementation((options: any, callback: any) => {
      setTimeout(() => callback(mockResponse), 0);
      return mockRequest;
    });
  });

  afterEach(() => {
    requestSpy.mockRestore();
  });

  it('makes GET request and returns response body', async () => {
    const responsePromise = httpsGet('https://example.com/api/test');

    // Wait for the request to be set up
    await new Promise(resolve => setTimeout(resolve, 10));

    mockResponse.emit('data', '{"success":');
    mockResponse.emit('data', 'true}');
    mockResponse.emit('end');

    const result = await responsePromise;
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('{"success":true}');
  });

  it('includes auth token in headers when provided', async () => {
    httpsGet('https://example.com/api/test', { token: 'my-secret-token' });

    await new Promise(resolve => setTimeout(resolve, 10));

    const callOptions = requestSpy.mock.calls[0][0];
    expect(callOptions.headers['Authorization']).toBe('token my-secret-token');
  });

  it('follows redirects up to maxRedirects', async () => {
    let callCount = 0;
    requestSpy.mockImplementation((options: any, callback: any) => {
      callCount++;
      const resp = new EventEmitter() as any;
      resp.headers = {};

      if (callCount === 1) {
        resp.statusCode = 302;
        // Use an allowed redirect host (GitHub CDN)
        resp.headers.location = 'https://objects.githubusercontent.com/new-path';
      } else {
        resp.statusCode = 200;
      }

      setTimeout(() => callback(resp), 0);
      return mockRequest;
    });

    const responsePromise = httpsGet('https://example.com/api/test');

    await new Promise(resolve => setTimeout(resolve, 10));
    mockResponse.emit('data', 'final response');
    mockResponse.emit('end');

    // Should have made 2 requests (original + redirect)
    expect(callCount).toBe(2);
  });

  it('rejects when too many redirects', async () => {
    requestSpy.mockImplementation((options: any, callback: any) => {
      const resp = new EventEmitter() as any;
      resp.statusCode = 302;
      // Use an allowed redirect host to test redirect count limiting
      resp.headers = { location: 'https://s3.amazonaws.com/loop' };
      setTimeout(() => callback(resp), 0);
      return mockRequest;
    });

    try {
      await httpsGet('https://example.com/api/test', { maxRedirects: 2 });
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.message).toBe('Too many redirects');
    }
  });

  it('rejects on request error', async () => {
    requestSpy.mockImplementation(() => {
      setTimeout(() => mockRequest.emit('error', new Error('Connection refused')), 0);
      return mockRequest;
    });

    try {
      await httpsGet('https://example.com/api/test');
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.message).toBe('Connection refused');
    }
  });
});

describe('getRedirectUrl', () => {
  let mockRequest: any;
  let requestSpy: any;

  beforeEach(() => {
    mockRequest = new EventEmitter() as any;
    mockRequest.setTimeout = mock(() => {});
    mockRequest.end = mock(() => {});
    mockRequest.destroy = mock(() => {});

    requestSpy = spyOn(https, 'request');
  });

  it('returns location header from 302 response', async () => {
    const mockResponse = new EventEmitter() as any;
    mockResponse.statusCode = 302;
    // Use an allowed redirect host (S3)
    mockResponse.headers = { location: 'https://s3.us-east-1.amazonaws.com/file.zip' };

    requestSpy.mockImplementation((options: any, callback: any) => {
      setTimeout(() => callback(mockResponse), 0);
      return mockRequest;
    });

    const result = await getRedirectUrl('https://example.com/download/123');
    expect(result).toBe('https://s3.us-east-1.amazonaws.com/file.zip');
  });

  it('rejects when response is not a redirect', async () => {
    const mockResponse = new EventEmitter() as any;
    mockResponse.statusCode = 200;
    mockResponse.headers = {};

    requestSpy.mockImplementation((options: any, callback: any) => {
      setTimeout(() => callback(mockResponse), 0);
      return mockRequest;
    });

    try {
      await getRedirectUrl('https://example.com/download/123');
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.message).toBe('Expected redirect, got HTTP 200');
    }
  });

  it('rejects when redirect has no location header', async () => {
    const mockResponse = new EventEmitter() as any;
    mockResponse.statusCode = 302;
    mockResponse.headers = {};

    requestSpy.mockImplementation((options: any, callback: any) => {
      setTimeout(() => callback(mockResponse), 0);
      return mockRequest;
    });

    try {
      await getRedirectUrl('https://example.com/download/123');
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.message).toBe('Redirect without location header');
    }
  });
});

describe('downloadFile', () => {
  let mockRequest: any;
  let mockResponse: any;
  let requestSpy: any;
  let mockWriteStream: any;
  let createWriteStreamSpy: any;
  let unlinkSpy: any;

  beforeEach(() => {
    mockRequest = new EventEmitter() as any;
    mockRequest.setTimeout = mock(() => {});
    mockRequest.end = mock(() => {});
    mockRequest.destroy = mock(() => {});

    mockResponse = new EventEmitter() as any;
    mockResponse.statusCode = 200;
    mockResponse.headers = { 'content-length': '100' };
    mockResponse.pipe = mock(() => mockResponse);

    mockWriteStream = new EventEmitter() as any;
    mockWriteStream.close = mock((cb: () => void) => cb());
    mockWriteStream.destroy = mock(() => {});

    requestSpy = spyOn(https, 'request').mockImplementation((options: any, callback: any) => {
      setTimeout(() => callback(mockResponse), 0);
      return mockRequest;
    });

    createWriteStreamSpy = spyOn(fs, 'createWriteStream').mockReturnValue(mockWriteStream as any);
    unlinkSpy = spyOn(fs, 'unlink').mockImplementation((path: any, cb: any) => cb && cb(null));
  });

  it('downloads file and reports progress', async () => {
    const progressUpdates: number[] = [];
    const downloadPromise = downloadFile(
      'https://example.com/file.bin',
      '/tmp/output.bin',
      (percent) => progressUpdates.push(percent)
    );

    await new Promise(resolve => setTimeout(resolve, 10));

    // Simulate receiving data in chunks
    mockResponse.emit('data', Buffer.alloc(50));
    mockResponse.emit('data', Buffer.alloc(50));
    mockWriteStream.emit('finish');

    await downloadPromise;

    expect(progressUpdates).toContain(50);
    expect(progressUpdates).toContain(100);
    expect(createWriteStreamSpy).toHaveBeenCalledWith('/tmp/output.bin');
  });

  it('follows redirects', async () => {
    let callCount = 0;
    requestSpy.mockImplementation((options: any, callback: any) => {
      callCount++;
      const resp = new EventEmitter() as any;
      resp.headers = {};

      if (callCount === 1) {
        resp.statusCode = 302;
        // Use an allowed redirect host (GitHub CDN)
        resp.headers.location = 'https://objects.githubusercontent.com/file.bin';
      } else {
        resp.statusCode = 200;
        resp.headers['content-length'] = '10';
        resp.pipe = mock(() => resp);
      }

      setTimeout(() => callback(resp), 0);
      return mockRequest;
    });

    const downloadPromise = downloadFile('https://example.com/file.bin', '/tmp/output.bin', () => {});

    await new Promise(resolve => setTimeout(resolve, 20));
    mockWriteStream.emit('finish');

    await downloadPromise;
    expect(callCount).toBe(2);
  });

  it('rejects on HTTP error status', async () => {
    mockResponse.statusCode = 404;

    const downloadPromise = downloadFile('https://example.com/file.bin', '/tmp/output.bin', () => {});

    try {
      await downloadPromise;
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.message).toBe('Download failed: HTTP 404');
    }
  });

  it('cleans up file on response error', async () => {
    const downloadPromise = downloadFile('https://example.com/file.bin', '/tmp/output.bin', () => {});

    await new Promise(resolve => setTimeout(resolve, 10));
    mockResponse.emit('error', new Error('Connection reset'));

    try {
      await downloadPromise;
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.message).toBe('Connection reset');
      expect(mockWriteStream.destroy).toHaveBeenCalled();
    }
  });

  it('uses custom timeout when provided', async () => {
    downloadFile('https://example.com/file.bin', '/tmp/output.bin', () => {}, { timeout: 60000 });

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockRequest.setTimeout).toHaveBeenCalledWith(60000, expect.any(Function));
  });
});

describe('isAllowedRedirectHost', () => {
  it('allows the GitHub API host', () => {
    expect(isAllowedRedirectHost(GITHUB_API_HOST)).toBe(true);
  });

  it('allows GitHub CDN domains', () => {
    expect(isAllowedRedirectHost('githubusercontent.com')).toBe(true);
    expect(isAllowedRedirectHost('objects.githubusercontent.com')).toBe(true);
    expect(isAllowedRedirectHost('github-releases.githubusercontent.com')).toBe(true);
    expect(isAllowedRedirectHost('raw.githubusercontent.com')).toBe(true);
  });

  it('allows S3 domains', () => {
    expect(isAllowedRedirectHost('s3.amazonaws.com')).toBe(true);
    expect(isAllowedRedirectHost('s3.us-east-1.amazonaws.com')).toBe(true);
    expect(isAllowedRedirectHost('s3-us-west-2.amazonaws.com')).toBe(true);
    expect(isAllowedRedirectHost('my-bucket.s3.amazonaws.com')).toBe(true);
  });

  it('rejects untrusted domains', () => {
    expect(isAllowedRedirectHost('evil.com')).toBe(false);
    expect(isAllowedRedirectHost('phishing-site.net')).toBe(false);
    expect(isAllowedRedirectHost('github.com.evil.com')).toBe(false);
    expect(isAllowedRedirectHost('s3.amazonaws.com.evil.com')).toBe(false);
  });

  it('is case insensitive', () => {
    expect(isAllowedRedirectHost('GITHUB.COM')).toBe(true);
    expect(isAllowedRedirectHost('S3.AMAZONAWS.COM')).toBe(true);
    expect(isAllowedRedirectHost('Objects.GitHubUserContent.COM')).toBe(true);
  });

  it('rejects redirect to untrusted host in downloadFile', async () => {
    const mockRequest = new EventEmitter() as any;
    mockRequest.setTimeout = mock(() => {});
    mockRequest.end = mock(() => {});
    mockRequest.destroy = mock(() => {});

    const requestSpy = spyOn(https, 'request').mockImplementation((options: any, callback: any) => {
      const resp = new EventEmitter() as any;
      resp.statusCode = 302;
      resp.headers = { location: 'https://evil.com/malicious.exe' };
      setTimeout(() => callback(resp), 0);
      return mockRequest;
    });

    try {
      await downloadFile('https://example.com/file.bin', '/tmp/output.bin', () => {});
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.message).toContain('Redirect to untrusted host blocked');
      expect(error.message).toContain('evil.com');
    }

    requestSpy.mockRestore();
  });
});
