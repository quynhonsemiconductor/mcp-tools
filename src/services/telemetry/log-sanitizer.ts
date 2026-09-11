/**
 * Log sanitization utilities for telemetry.
 *
 * Provides pattern-based redaction of sensitive data before sending logs
 * to external telemetry systems like New Relic.
 */

/**
 * Maximum byte size for log data payloads.
 * Truncating helps control costs and prevents large payloads.
 */
export const MAX_LOG_DATA_BYTES = 1024;

/**
 * Patterns for identifying and redacting sensitive data.
 * Each pattern has a regex and replacement string.
 * NOTE: Order matters - more specific patterns should come before generic ones.
 */
const SANITIZATION_PATTERNS: Array<{
  pattern: RegExp;
  replacement: string;
  description: string;
}> = [
  {
    // Bearer tokens in authorization headers (must come before generic key patterns)
    pattern: /(Bearer\s+)[A-Za-z0-9\-_.]+/gi,
    replacement: '$1[REDACTED]',
    description: 'Bearer tokens',
  },
  {
    // Basic auth tokens (base64 encoded credentials, must come before generic key patterns)
    pattern: /(Basic\s+)[A-Za-z0-9+/=]+/gi,
    replacement: '$1[REDACTED]',
    description: 'Basic auth tokens',
  },
  {
    // JWT tokens (three base64url segments separated by dots) - specific pattern first
    pattern: /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g,
    replacement: '[JWT_REDACTED]',
    description: 'JWT tokens',
  },
  {
    // Private keys
    pattern: /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g,
    replacement: '[PRIVATE_KEY_REDACTED]',
    description: 'Private keys',
  },
  {
    // AWS access keys (AKIA...)
    pattern: /AKIA[A-Z0-9]{16}/g,
    replacement: '[AWS_KEY_REDACTED]',
    description: 'AWS access keys',
  },
  {
    // GitHub tokens (ghp_, gho_, ghs_, ghr_, github_pat_)
    pattern: /(ghp_|gho_|ghs_|ghr_|github_pat_)[A-Za-z0-9_]+/g,
    replacement: '[GITHUB_TOKEN_REDACTED]',
    description: 'GitHub tokens',
  },
  {
    // API keys, tokens, secrets in key=value or key:value format
    // Matches: API_KEY=abc123, token: xyz, SECRET=sensitive
    // More restrictive to avoid matching "Authorization" header keyword
    pattern: /([A-Za-z_]*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Za-z_]*[=:]\s*)([^\s,}"']+)/gi,
    replacement: '$1[REDACTED]',
    description: 'API keys, tokens, secrets, passwords in key=value format',
  },
  {
    // Passwords embedded in URLs (e.g., https://user:password@host.com)
    // Also handles database connection strings (MongoDB, PostgreSQL, MySQL)
    pattern: /:\/\/([^:]+):([^@]+)@/g,
    replacement: '://[REDACTED]:[REDACTED]@',
    description: 'Credentials in URLs',
  },
  {
    // New Relic license keys (typically 40 hex chars)
    pattern: /([A-Fa-f0-9]{40})/g,
    replacement: '[LICENSE_KEY_REDACTED]',
    description: 'New Relic license keys',
  },
];

/**
 * Sanitize a string by redacting sensitive patterns.
 *
 * @param input - The string to sanitize
 * @returns The sanitized string with sensitive data redacted
 */
export function sanitizeString(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }

  let result = input;
  for (const { pattern, replacement } of SANITIZATION_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Sanitize an object by recursively redacting sensitive values.
 *
 * @param obj - The object to sanitize
 * @param depth - Current recursion depth (to prevent infinite loops)
 * @returns The sanitized object
 */
export function sanitizeObject(obj: unknown, depth = 0): unknown {
  // Prevent infinite recursion
  const MAX_DEPTH = 10;
  if (depth > MAX_DEPTH) {
    return '[MAX_DEPTH_EXCEEDED]';
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Check if the key itself suggests sensitive data
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('key') ||
        lowerKey.includes('credential') ||
        lowerKey.includes('auth')
      ) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeObject(value, depth + 1);
      }
    }
    return sanitized;
  }

  // For functions, symbols, etc., return a placeholder
  return '[UNSUPPORTED_TYPE]';
}

/**
 * Truncate a string to a maximum byte length.
 *
 * Handles UTF-8 multi-byte characters correctly by encoding to bytes
 * before truncation.
 *
 * @param input - The string to truncate
 * @param maxBytes - Maximum byte length
 * @returns The truncated string
 */
export function truncateToBytes(input: string, maxBytes: number): string {
  if (!input || typeof input !== 'string') {
    return input;
  }

  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);

  if (bytes.length <= maxBytes) {
    return input;
  }

  // Truncate and decode, handling incomplete multi-byte sequences
  const truncatedBytes = bytes.slice(0, maxBytes);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  return decoder.decode(truncatedBytes) + '...';
}

/**
 * Sanitize log data for telemetry export.
 *
 * This function:
 * 1. Sanitizes sensitive patterns in the data
 * 2. Converts to JSON string
 * 3. Truncates to MAX_LOG_DATA_BYTES
 *
 * @param data - The data to sanitize (can be any type)
 * @returns Sanitized and truncated JSON string, or undefined if no data
 */
export function sanitizeLogData(data: unknown): string | undefined {
  if (data === undefined || data === null) {
    return undefined;
  }

  try {
    const sanitized = sanitizeObject(data);
    const jsonString = JSON.stringify(sanitized);
    return truncateToBytes(jsonString, MAX_LOG_DATA_BYTES);
  } catch {
    // If serialization fails, return a safe placeholder
    return '[SERIALIZATION_ERROR]';
  }
}

/**
 * Sanitize a log message for telemetry export.
 *
 * @param message - The log message to sanitize
 * @returns The sanitized message
 */
export function sanitizeLogMessage(message: string): string {
  return sanitizeString(message);
}
