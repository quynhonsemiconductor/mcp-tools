/**
 * Shared placeholder detection utilities
 *
 * Used by multiple validation checks to detect placeholder values
 * in environment variables and configuration values.
 */

/**
 * Patterns that indicate a value is a placeholder that needs to be replaced.
 *
 * Note: These patterns are designed to avoid false positives for:
 * - URLs (e.g., https://api.example.com)
 * - File paths (e.g., /path/to/example/file)
 *
 * The `isPlaceholderValue` function applies additional filtering to exclude
 * URLs and paths before checking these patterns.
 */
export const PLACEHOLDER_PATTERNS = [
  /^your[_-]/i, // your-api-key, your_token
  /[_-]here$/i, // your-key-here, token_here
  /^<.*>$/, // <API_KEY>
  /^\[.*\]$/, // [your-key-here]
  /^\{.*\}$/, // {placeholder}
  /xxx/i, // xxxxx, API_KEY_XXX
  /placeholder/i,
  /^example$/i, // exact match only to avoid matching URLs like api.example.com
  /change[_-]?me/i, // changeme, change_me, change-me
  /replace[_-]?me/i, // replace_me, replaceme, REPLACE_ME
  /update[_-]?this/i, // update_this, UPDATE_THIS
  /insert[_-]/i, // insert-your-key
  /^todo$/i,
  /^tbd$/i, // TBD, tbd
  /^n\/a$/i, // N/A
  /^none$/i, // none, NONE
  /^null$/i, // null (as a string placeholder)
  /^undefined$/i, // undefined (as a string placeholder)
];

/**
 * Check if a value looks like a URL
 */
export function isUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

/**
 * Check if a value looks like a file path.
 *
 * Detects:
 * - Absolute Unix paths (/path/to/file)
 * - Absolute Windows paths (C:\path\to\file, D:/path)
 * - Relative paths (./file, ../file)
 * - Arguments with directory separators (foo/bar.js)
 *
 * Excludes URLs (http://, https://)
 *
 * Note: This is used by both placeholder detection and executable path validation.
 * The function intentionally returns false for URLs to avoid false positives
 * when checking environment variable values.
 *
 * @param value - The string to check
 * @returns true if the value looks like a file path
 */
export function isFilePath(value: string): boolean {
  // Exclude URLs first
  if (isUrl(value)) return false;

  // Unix absolute path
  if (value.startsWith('/')) return true;
  // Windows absolute path (C:\, D:\, etc.)
  if (/^[a-zA-Z]:[/\\]/.test(value)) return true;
  // Relative paths
  if (value.startsWith('./') || value.startsWith('../')) return true;
  if (value.startsWith('.\\') || value.startsWith('..\\')) return true;
  // Arguments with directory separators (but not URLs - already excluded above)
  if (value.includes('/') || value.includes('\\')) return true;

  return false;
}

/**
 * Check if a value looks like a placeholder that needs to be replaced.
 *
 * Note: Empty strings and whitespace-only values return `true` since they
 * effectively represent missing/placeholder values. Callers that need to
 * distinguish between empty values and placeholder patterns (e.g., to use
 * different issue codes) should check for empty values separately before
 * calling this function.
 *
 * @param value - The value to check
 * @returns true if the value is empty/whitespace or matches a placeholder pattern
 *
 * @example
 * isPlaceholderValue('') // true (empty)
 * isPlaceholderValue('your-api-key') // true (placeholder pattern)
 * isPlaceholderValue('sk-abc123') // false (real value)
 */
export function isPlaceholderValue(value: string): boolean {
  if (!value || value.trim() === '') {
    return true;
  }

  // Exclude URLs and file paths from placeholder detection to avoid false positives
  // e.g., https://api.example.com or /path/to/example/file should not be flagged
  if (isUrl(value) || isFilePath(value)) {
    return false;
  }

  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}
