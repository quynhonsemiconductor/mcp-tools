/**
 * Utility functions for the installer.
 * Extracted for testability without Electron dependencies.
 */

import * as os from 'os';
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import * as crypto from 'crypto';

// GitHub configuration
export const GITHUB_API_HOST = 'api.github.com';
export const REPO_OWNER = 'quynhonsemiconductor';
export const REPO_NAME = 'mcp-tools';

/**
 * Allowed hostnames for HTTP redirects.
 * This prevents open redirect vulnerabilities (CWE-601) by only allowing
 * redirects to known, trusted CDN and storage domains.
 */
export const ALLOWED_REDIRECT_HOSTS = [
  GITHUB_API_HOST,
  // GitHub's CDN domains
  'github.com',
  'githubusercontent.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
  'github-releases.githubusercontent.com',
  'github-cloud.githubusercontent.com',
  'github-cloud.s3.amazonaws.com',
  // AWS S3 domains (used by GitHub for artifact storage)
  's3.amazonaws.com',
  'pipelines.actions.githubusercontent.com',
  // Allow any *.s3.amazonaws.com or *.s3-*.amazonaws.com subdomain
];

/**
 * Validate that a redirect URL hostname is in the allowlist.
 * Prevents open redirect vulnerabilities (CWE-601).
 */
export function isAllowedRedirectHost(hostname: string): boolean {
  const normalizedHost = hostname.toLowerCase();

  // Check exact matches
  if (ALLOWED_REDIRECT_HOSTS.includes(normalizedHost)) {
    return true;
  }

  // Check for allowed subdomain patterns
  // Allow *.githubusercontent.com
  if (normalizedHost.endsWith('.githubusercontent.com')) {
    return true;
  }

  // Allow *.s3.amazonaws.com and *.s3-*.amazonaws.com (GitHub artifact storage)
  if (normalizedHost.endsWith('.s3.amazonaws.com') ||
      /\.s3-[a-z0-9-]+\.amazonaws\.com$/.test(normalizedHost) ||
      /^s3\.[a-z0-9-]+\.amazonaws\.com$/.test(normalizedHost) ||
      /^s3-[a-z0-9-]+\.amazonaws\.com$/.test(normalizedHost)) {
    return true;
  }

  return false;
}

export interface InstallConfig {
  binaryName: string;
  defaultInstallPath: string;
  requiresElevation: boolean;
}

/**
 * XOR deobfuscation for embedded credentials.
 *
 * SECURITY NOTE: This is simple XOR obfuscation, NOT encryption.
 * It's designed to prevent casual inspection of tokens in the binary,
 * not to provide cryptographic security. Anyone with access to the binary
 * and the obfuscation key (also in the binary) can reverse this.
 * This is acceptable for our use case (preventing accidental token exposure
 * in string dumps) but should not be relied upon for actual secret protection.
 */
export function deobfuscate(encoded: string, obfuscationKey: string): string {
  if (encoded.startsWith('__') && encoded.endsWith('__')) {
    return encoded; // Placeholder, not yet injected
  }
  if (obfuscationKey.startsWith('__') && obfuscationKey.endsWith('__')) {
    return encoded; // No key, assume plaintext (dev mode)
  }
  try {
    const data = Buffer.from(encoded, 'base64');
    const key = Buffer.from(obfuscationKey, 'base64');
    const result = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i++) {
      result[i] = data[i] ^ key[i % key.length];
    }
    return result.toString('utf-8');
  } catch {
    return encoded;
  }
}

/**
 * Get the platform-specific install configuration.
 */
export function getInstallConfig(
  platform: NodeJS.Platform = os.platform(),
  arch: string = os.arch()
): InstallConfig {
  switch (platform) {
    case 'win32':
      return {
        binaryName: 'qnsc-mcp-win-x64.exe',
        defaultInstallPath: 'C:\\Program Files\\QNSC-MCP',
        requiresElevation: true,
      };
    case 'darwin':
      return {
        binaryName: arch === 'arm64' ? 'qnsc-mcp-macos-arm64' : 'qnsc-mcp-macos-x64',
        defaultInstallPath: '/usr/local/bin',
        requiresElevation: true,
      };
    case 'linux':
      return {
        binaryName: arch === 'arm64' ? 'qnsc-mcp-linux-arm64' : 'qnsc-mcp-linux-x64',
        defaultInstallPath: '/usr/local/bin',
        requiresElevation: true,
      };
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Sanitize a file path for safe use in shell commands.
 * Rejects paths with dangerous characters that could enable injection.
 */
export function sanitizePath(inputPath: string): string {
  // Reject paths with characters that could be used for injection
  // Allow alphanumeric, spaces, hyphens, underscores, dots, slashes, colons (for Windows drives)
  const dangerousChars = /[;&|`$(){}[\]<>!^"'\n\r]/;
  if (dangerousChars.test(inputPath)) {
    throw new Error(`Invalid characters in path: ${inputPath}`);
  }
  return inputPath;
}

/**
 * Get the shell profile file path for the current user.
 * Returns null if using a standard PATH location that doesn't need modification.
 */
export function getShellProfilePath(
  installDir: string,
  platform: NodeJS.Platform = os.platform(),
  homedir: string = os.homedir(),
  shell: string = process.env.SHELL || '/bin/bash',
  existsSync: typeof fs.existsSync = fs.existsSync
): string | null {
  // Standard locations are typically already in PATH
  const standardPaths = ['/usr/local/bin', '/usr/bin', '/opt/homebrew/bin'];
  if (standardPaths.includes(installDir)) {
    return null;
  }

  if (shell.includes('zsh')) {
    return path.join(homedir, '.zshrc');
  } else if (shell.includes('bash')) {
    // Prefer .bash_profile on macOS, .bashrc on Linux
    const bashProfile = path.join(homedir, '.bash_profile');
    if (platform === 'darwin' || existsSync(bashProfile)) {
      return bashProfile;
    }
    return path.join(homedir, '.bashrc');
  }
  return path.join(homedir, '.profile');
}

/**
 * Parse a download URL to extract hostname and path.
 * Handles both full URLs and relative paths.
 */
export function parseDownloadUrl(downloadUrl: string, defaultHost: string = GITHUB_API_HOST): {
  hostname: string;
  path: string;
} {
  try {
    const parsedUrl = new URL(downloadUrl);
    return {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
    };
  } catch {
    // If URL parsing fails, try the legacy approach (relative path)
    if (downloadUrl.startsWith('https://')) {
      return {
        hostname: defaultHost,
        path: downloadUrl.replace(`https://${defaultHost}`, ''),
      };
    }
    return {
      hostname: defaultHost,
      path: downloadUrl,
    };
  }
}

/**
 * Parse a checksum file content to extract the hash.
 * Checksum file format: "hash  filename" or "hash filename"
 */
export function parseChecksumFile(content: string): string | null {
  const match = content.trim().match(/^([a-fA-F0-9]{64})\s/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Calculate SHA256 hash of a buffer.
 */
export function calculateBufferChecksum(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Calculate SHA256 hash of a file.
 */
export function calculateFileChecksum(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Verify a checksum matches the expected value.
 * Returns true if they match, false otherwise.
 */
export function verifyChecksumMatch(
  actual: string,
  expected: string
): boolean {
  return actual.toLowerCase() === expected.toLowerCase();
}

export interface DownloadOptions {
  /** Optional auth token for authenticated requests */
  token?: string | null;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Maximum number of redirects to follow (default: 5) */
  maxRedirects?: number;
  /** Expected file size in bytes (used for progress when Content-Length is missing) */
  expectedSize?: number;
  /** Maximum response body size in bytes for API responses (default: 10MB) */
  maxResponseSize?: number;
  /** Accept header value (default varies by function) */
  accept?: string;
}

/**
 * Download a file from a URL to a local path.
 * Handles redirects, progress reporting, and error cleanup.
 */
export async function downloadFile(
  downloadUrl: string,
  destPath: string,
  onProgress: (percent: number) => void,
  options: DownloadOptions = {}
): Promise<void> {
  const { token = null, timeout = 30000, maxRedirects = 5, expectedSize = 0 } = options;

  return new Promise((resolve, reject) => {
    const { hostname, path: urlPath } = parseDownloadUrl(downloadUrl);

    // Guard against multiple resolve/reject calls from concurrent error events
    let hasSettled = false;
    const settleOnce = {
      resolve: () => {
        if (hasSettled) return;
        hasSettled = true;
        resolve();
      },
      reject: (err: Error) => {
        if (hasSettled) return;
        hasSettled = true;
        reject(err);
      },
    };

    const initialOptions: https.RequestOptions = {
      hostname,
      path: urlPath,
      method: 'GET',
      headers: {
        'Accept': 'application/octet-stream',
        'User-Agent': 'QNSC-MCP-Installer',
        ...(token ? { 'Authorization': `token ${token}` } : {}),
      },
    };

    const makeRequest = (reqOptions: https.RequestOptions, redirectCount = 0) => {
      if (redirectCount > maxRedirects) {
        settleOnce.reject(new Error('Too many redirects'));
        return;
      }

      const req = https.request(reqOptions, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          const location = res.headers.location;
          if (!location) {
            settleOnce.reject(new Error('Redirect without location header'));
            return;
          }

          const redirectUrl = new URL(location);

          // Validate redirect hostname to prevent open redirect (CWE-601)
          if (!isAllowedRedirectHost(redirectUrl.hostname)) {
            settleOnce.reject(new Error(`Redirect to untrusted host blocked: ${redirectUrl.hostname}`));
            return;
          }

          makeRequest({
            hostname: redirectUrl.hostname,
            path: redirectUrl.pathname + redirectUrl.search,
            method: 'GET',
            headers: { 'User-Agent': 'QNSC-MCP-Installer' },
          }, redirectCount + 1);
          return;
        }

        if (res.statusCode !== 200) {
          settleOnce.reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }

        const contentLength = parseInt(res.headers['content-length'] || '0', 10);
        const totalSize = contentLength > 0 ? contentLength : expectedSize;
        let downloadedSize = 0;

        const file = fs.createWriteStream(destPath);

        res.on('data', (chunk) => {
          downloadedSize += chunk.length;
          if (totalSize > 0) {
            try {
              onProgress(Math.min(100, Math.round((downloadedSize / totalSize) * 100)));
            } catch {
              // Ignore errors in progress callback to prevent resource leaks
            }
          }
        });

        res.pipe(file);

        res.on('error', (err) => {
          req.destroy(); // Abort the request to close the connection
          file.destroy();
          fs.unlink(destPath, () => {});
          settleOnce.reject(err);
        });

        file.on('finish', () => {
          file.close(() => settleOnce.resolve());
        });

        file.on('error', (err) => {
          fs.unlink(destPath, () => {});
          settleOnce.reject(err);
        });
      });

      req.setTimeout(timeout, () => {
        req.destroy(new Error('Request timeout'));
      });
      req.on('error', (err) => settleOnce.reject(err));
      req.end();
    };

    makeRequest(initialOptions);
  });
}

/**
 * Make an HTTPS GET request and return the response body as a string.
 * Handles redirects up to maxRedirects.
 */
/** Default max response size for API calls (10MB) */
const DEFAULT_MAX_RESPONSE_SIZE = 10 * 1024 * 1024;

export async function httpsGet(
  url: string,
  options: DownloadOptions = {}
): Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  const { token = null, timeout = 30000, maxRedirects = 5, maxResponseSize = DEFAULT_MAX_RESPONSE_SIZE, accept = 'application/vnd.github.v3+json' } = options;

  return new Promise((resolve, reject) => {
    const { hostname, path: urlPath } = parseDownloadUrl(url);

    // Guard against multiple resolve/reject calls from concurrent error events
    let hasSettled = false;
    const settleOnce = {
      resolve: (value: { statusCode: number; headers: Record<string, string | string[] | undefined>; body: string }) => {
        if (hasSettled) return;
        hasSettled = true;
        resolve(value);
      },
      reject: (err: Error) => {
        if (hasSettled) return;
        hasSettled = true;
        reject(err);
      },
    };

    const initialOptions: https.RequestOptions = {
      hostname,
      path: urlPath,
      method: 'GET',
      headers: {
        'Accept': accept,
        'User-Agent': 'QNSC-MCP-Installer',
        ...(token ? { 'Authorization': `token ${token}` } : {}),
      },
    };

    const makeRequest = (reqOptions: https.RequestOptions, redirectCount = 0) => {
      if (redirectCount > maxRedirects) {
        settleOnce.reject(new Error('Too many redirects'));
        return;
      }

      const req = https.request(reqOptions, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          const location = res.headers.location;
          if (!location) {
            settleOnce.reject(new Error('Redirect without location header'));
            return;
          }

          const redirectUrl = new URL(location);

          // Validate redirect hostname to prevent open redirect (CWE-601)
          if (!isAllowedRedirectHost(redirectUrl.hostname)) {
            settleOnce.reject(new Error(`Redirect to untrusted host blocked: ${redirectUrl.hostname}`));
            return;
          }

          makeRequest({
            hostname: redirectUrl.hostname,
            path: redirectUrl.pathname + redirectUrl.search,
            method: 'GET',
            headers: { 'User-Agent': 'QNSC-MCP-Installer' },
          }, redirectCount + 1);
          return;
        }

        // Check Content-Length if provided to reject excessively large responses early
        const contentLength = parseInt(res.headers['content-length'] || '0', 10);
        if (contentLength > maxResponseSize) {
          req.destroy();
          settleOnce.reject(new Error(`Response too large: ${contentLength} bytes exceeds limit of ${maxResponseSize} bytes`));
          return;
        }

        let data = '';
        let receivedSize = 0;
        res.on('data', (chunk) => {
          receivedSize += chunk.length;
          // Also check during streaming in case Content-Length was missing or incorrect
          if (receivedSize > maxResponseSize) {
            req.destroy();
            settleOnce.reject(new Error(`Response too large: exceeded limit of ${maxResponseSize} bytes`));
            return;
          }
          data += chunk;
        });
        res.on('error', (err) => {
          settleOnce.reject(new Error(`Error reading response: ${err.message}`));
        });
        res.on('end', () => {
          settleOnce.resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers as Record<string, string | string[] | undefined>,
            body: data,
          });
        });
      });

      req.setTimeout(timeout, () => {
        req.destroy(new Error('Request timeout'));
      });
      req.on('error', (err) => settleOnce.reject(err));
      req.end();
    };

    makeRequest(initialOptions);
  });
}

/**
 * Get a redirect URL from an HTTPS request (for artifact downloads).
 * Returns the Location header from a 301 or 302 response.
 */
export async function getRedirectUrl(
  url: string,
  options: DownloadOptions = {}
): Promise<string> {
  const { token = null, timeout = 30000 } = options;

  return new Promise((resolve, reject) => {
    const { hostname, path: urlPath } = parseDownloadUrl(url);

    const reqOptions: https.RequestOptions = {
      hostname,
      path: urlPath,
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'QNSC-MCP-Installer',
        ...(token ? { 'Authorization': `token ${token}` } : {}),
      },
    };

    const req = https.request(reqOptions, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        const location = res.headers.location;
        if (location) {
          // Validate redirect hostname to prevent open redirect (CWE-601)
          try {
            const redirectUrl = new URL(location);
            if (!isAllowedRedirectHost(redirectUrl.hostname)) {
              reject(new Error(`Redirect to untrusted host blocked: ${redirectUrl.hostname}`));
              return;
            }
          } catch {
            reject(new Error(`Invalid redirect URL: ${location}`));
            return;
          }
          resolve(location);
        } else {
          reject(new Error('Redirect without location header'));
        }
      } else {
        reject(new Error(`Expected redirect, got HTTP ${res.statusCode}`));
      }
    });

    req.setTimeout(timeout, () => {
      req.destroy(new Error('Request timeout'));
    });
    req.on('error', reject);
    req.end();
  });
}
