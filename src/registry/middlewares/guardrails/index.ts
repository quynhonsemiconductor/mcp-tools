import { logInfo } from '../../../services/logger';
import { GenericMiddleware, RegistryItemContext, getConfigFromContext } from '../types';
import { DEFAULT_SECRET_PATTERNS, SecretPattern } from './patterns';

function calculateEntropy(str: string): number {
  if (str.length === 0) return 0;

  const charCount = new Map<string, number>();

  // Count occurrences of each character
  for (const char of str) {
    charCount.set(char, (charCount.get(char) || 0) + 1);
  }

  let entropy = 0;
  const length = str.length;

  // Shannon's formula
  for (const count of charCount.values()) {
    const probability = count / length;
    entropy -= probability * Math.log2(probability);
  }

  return entropy;
}

function redactSecrets(
  input: string,
  patterns: SecretPattern[] = DEFAULT_SECRET_PATTERNS,
): { redacted: string; found: boolean } {
  let redacted = input;
  let found = false;

  for (const { id: _id, pattern, minEntropy, replacement } of patterns) {
    const globalPattern = new RegExp(
      pattern,
      pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
    );
    const matches = input.matchAll(globalPattern);
    // logDebug(`Checking for pattern "${id}" with regex "${globalPattern}" in input `);

    for (const match of matches) {
      const matchText = match[0];

      // Skip if entropy check is required and not met
      if (minEntropy !== undefined) {
        const entropy = calculateEntropy(matchText);
        if (entropy < minEntropy) {
          continue;
        }
      }

      redacted = redacted.replace(matchText, replacement);
      found = true;
    }
  }

  return { redacted, found };
}

/**
 * Creates a middleware for applying guardrails to registry items. This middleware
 * masks any PII, authentication tokens, or sensitive information.
 *
 * @template T - Type of context (must extend RegistryItemContext)
 * @template R - Return type from the middleware chain
 * @returns A middleware function that validates environment variables
 */
export function createGuardrailsMiddleware<
  T extends RegistryItemContext,
  R = unknown,
>(): GenericMiddleware<T, R> {
  return async (context: T, next: (context: T) => Promise<R>): Promise<R> => {
    // Get the config using the utility function
    const _config = getConfigFromContext(context);

    const payload = JSON.stringify(context.args || {});
    const { redacted, found } = redactSecrets(payload);

    if (found) {
      logInfo(`Redacted sensitive information in payload`);
      context.args = JSON.parse(redacted); // Update args with redacted payload
    }

    // execute the next middleware in the chain
    const result = await next(context);

    // If the result has content, redact sensitive information in it
    if (isContentResult(result)) {
      result.content = result.content.map((item) => {
        if (typeof item === 'object' && item !== null && typeof item.text === 'string') {
          const { redacted, found } = redactSecrets(item.text);
          if (found) {
            logInfo(`Redacted sensitive information in content text`);
            item.text = redacted; // Update text with redacted content
          }
        }

        return item;
      });
    }

    return result;
  };
}

/** A single content item as returned by tool/prompt handlers. */
interface ContentItem {
  text?: string;
  [key: string]: unknown;
}

/** A result carrying a `content` array of items that may contain redactable text. */
interface ContentResult {
  content: ContentItem[];
}

/**
 * Narrows an unknown middleware result to one that exposes a mutable
 * `content` array, so its text entries can be scanned for secrets.
 */
function isContentResult(result: unknown): result is ContentResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    'content' in result &&
    Array.isArray((result as { content: unknown }).content)
  );
}
