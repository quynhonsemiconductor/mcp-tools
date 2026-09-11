/**
 * Credential redaction utilities for defense-in-depth log safety (T028).
 *
 * Provides pattern-based redaction of sensitive values that should never
 * appear in logs, stdout, stderr, or error messages. Used as a safety net
 * alongside the primary strategy of never passing credentials to log functions.
 *
 * Patterns matched:
 * - JWTs (three dot-separated base64url segments)
 * - Partial JWT fragments (base64url-encoded headers starting with eyJ)
 * - Bearer tokens in header values
 * - Sensitive JSON key-value pairs (clientSecret, access_token, etc.)
 * - API keys (long alphanumeric/hex strings)
 * - OAuth authorization codes
 * - Refresh tokens
 *
 * @module
 */

/**
 * Regex patterns for common credential formats.
 * Each pattern captures the sensitive portion and replaces it with a redacted marker.
 */
const CREDENTIAL_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // JWT tokens: three base64url-encoded segments separated by dots
  // Matches tokens like eyJhbGc...eyJzdWI...SflKxwR...
  {
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    replacement: '[REDACTED_JWT]',
  },
  // Partial JWT header: base64url-encoded JSON starting with eyJ (even without full 3-part structure)
  // Catches truncated JWTs or JWT fragments echoed in error messages
  {
    pattern: /\beyJ[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{5,})*/g,
    replacement: '[REDACTED_JWT]',
  },
  // Bearer token values in "Bearer <token>" format
  {
    pattern: /Bearer\s+[A-Za-z0-9_.\-/+=]{20,}/gi,
    replacement: 'Bearer [REDACTED]',
  },
  // Sensitive JSON key-value pairs (clientSecret, client_secret, etc.)
  {
    pattern:
      /("(?:client[_]?secret|access[_]?token|refresh[_]?token|api[_]?key|authorization)")\s*:\s*"[^"]+"/gi,
    replacement: '$1:"[REDACTED]"',
  },
  // Generic long base64/hex strings (likely tokens or API keys, 40+ chars)
  // Only match standalone sequences not already caught by JWT pattern
  {
    pattern: /\b[A-Za-z0-9_-]{40,}\b/g,
    replacement: '[REDACTED_CREDENTIAL]',
  },
];

/**
 * Known sensitive environment variable names.
 * Values from these env vars should never appear in logs.
 */
const SENSITIVE_ENV_VARS = [
  'GITHUB_TOKEN',
  'GRAFANA_K6_TOKEN',
  'GOOGLE_CRUX_API_KEY',
  'SWAGGER_HUB_API_KEY',
  'GEOCODE_MAPS_API_KEY',
  'AZURE_APPLICATION_CERTIFICATE_PASSWORD',
  'QNSC_MCP_API_KEY',
  'ENTRA_CLIENT_SECRET',
  'ENTRA_ACCESS_TOKEN',
] as const;

/**
 * Redact potential credential values from a string.
 *
 * Applies pattern-based redaction as a defense-in-depth measure.
 * This should be used on error messages from external sources (e.g., HTTP responses,
 * third-party libraries) before logging, NOT as a substitute for avoiding credential
 * logging in the first place.
 *
 * @param input - The string to redact credentials from
 * @returns The input string with credential-like values replaced
 */
export function redactCredentials(input: string): string {
  if (!input) return input;

  let result = input;
  for (const { pattern, replacement } of CREDENTIAL_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }

  return result;
}

/**
 * Redact known sensitive environment variable values from a string.
 *
 * Checks the current process environment for sensitive values and replaces
 * any occurrences in the input string. Useful for sanitizing error messages
 * that might inadvertently include env var values.
 *
 * @param input - The string to redact env var values from
 * @returns The input string with sensitive env var values replaced
 */
export function redactEnvCredentials(input: string): string {
  if (!input) return input;

  let result = input;
  for (const envVar of SENSITIVE_ENV_VARS) {
    const value = process.env[envVar]?.trim();
    if (value && value.length > 0) {
      // Escape special regex characters in the value
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'g'), `[REDACTED:${envVar}]`);
    }
  }

  return result;
}

/**
 * Sanitize an error message for safe logging.
 *
 * Combines pattern-based redaction and env-var redaction to ensure
 * error messages from external sources are safe to log.
 *
 * @param message - The error message to sanitize
 * @returns The sanitized message safe for logging
 */
export function sanitizeForLogging(message: string): string {
  return redactEnvCredentials(redactCredentials(message));
}
