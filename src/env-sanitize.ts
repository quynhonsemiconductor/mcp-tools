/**
 * Pure helpers for normalizing raw environment variables before Zod validation.
 *
 * Kept in a side-effect-free module (no dotenv, no process.exit) so the logic
 * can be unit tested directly. `env.ts` consumes these and performs the
 * validate-or-exit step.
 */

/**
 * Check whether a value is an unresolved template placeholder.
 *
 * Claude Desktop's MCPB manifest uses `${user_config.VAR}` syntax.
 * When a user hasn't configured a variable, the literal placeholder
 * string is passed through as the env var value. Treating these as
 * real values causes downstream failures (invalid URLs, bad API keys, etc.).
 */
export function isUnresolvedPlaceholder(value: string | undefined): boolean {
  return typeof value === 'string' && value.startsWith('${');
}

/**
 * Sanitize environment variables before schema validation.
 *
 * Returns a copy of the input with values that represent "unset" replaced
 * by `undefined`, so Zod's `.optional()` / `.default()` treat them as absent
 * rather than as invalid strings. Two cases are normalized:
 *
 * 1. Unresolved `${user_config.VAR}` placeholders (see isUnresolvedPlaceholder).
 * 2. Empty or whitespace-only strings. Claude Desktop passes a blank optional
 *    user_config field (one with no manifest default) through as an empty
 *    string. Without this, a var like `z.string().url().optional()` rejects
 *    the empty string ("Invalid URL") and crashes the entire server on startup,
 *    taking down every tool — not just the one that owns the variable.
 */
export function sanitizeEnv(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const cleaned: Record<string, string | undefined> = { ...env };
  for (const [key, value] of Object.entries(cleaned)) {
    if (isUnresolvedPlaceholder(value) || value?.trim() === '') {
      cleaned[key] = undefined;
    }
  }
  return cleaned;
}
