/**
 * String similarity utilities for typo detection and suggestions.
 *
 * Uses the string-similarity library (Dice coefficient) to find the closest match
 * from a list of candidates. This provides "did you mean?" suggestions when users
 * make typos in MCP names, tool IDs, or category names.
 */

import { compareTwoStrings, findBestMatch } from 'string-similarity';

/**
 * Result of finding the closest match
 */
export interface ClosestMatchResult {
  /** The best matching candidate */
  match: string;
  /** Similarity score (0-1) */
  similarity: number;
  /** Whether the match meets the threshold */
  isGoodMatch: boolean;
}

/**
 * Find the closest matching string from a list of candidates.
 *
 * @param input The input string to match
 * @param candidates Array of possible matches
 * @param threshold Minimum similarity required (0-1, default 0.5)
 * @returns The closest match result, or null if no candidates
 *
 * @example
 * findClosestMatch('figma', ['figma-dev', 'confluence', 'linear'])
 * // Returns { match: 'figma-dev', similarity: 0.7, isGoodMatch: true }
 *
 * @example
 * findClosestMatch('xyz', ['figma-dev', 'confluence', 'linear'])
 * // Returns { match: 'linear', similarity: 0.17, isGoodMatch: false }
 */
export function findClosestMatch(
  input: string,
  candidates: string[],
  threshold: number = 0.5,
): ClosestMatchResult | null {
  if (candidates.length === 0) return null;

  const result = findBestMatch(input, candidates);

  return {
    match: result.bestMatch.target,
    similarity: result.bestMatch.rating,
    isGoodMatch: result.bestMatch.rating >= threshold,
  };
}

/**
 * Create a message with a "Did you mean?" suggestion appended if a close match exists.
 *
 * This centralizes the suggestion format across all validation checks.
 *
 * @param message The base error/warning message
 * @param invalidValue The invalid value entered by the user
 * @param validValues Array of valid options to match against
 * @param threshold Minimum similarity required (0-1, default 0.5)
 * @returns The message with suggestion appended if a good match was found
 *
 * @example
 * createSuggestionMessage('Unknown MCP: "figma"', 'figma', ['figma-dev', 'confluence'])
 * // Returns: 'Unknown MCP: "figma"\n  Did you mean "figma-dev"?'
 *
 * @example
 * createSuggestionMessage('Unknown MCP: "xyz"', 'xyz', ['figma-dev', 'confluence'])
 * // Returns: 'Unknown MCP: "xyz"' (no good match found)
 */
export function createSuggestionMessage(
  message: string,
  invalidValue: string,
  validValues: string[],
  threshold: number = 0.5,
): string {
  const closestMatch = findClosestMatch(invalidValue, validValues, threshold);
  // Don't suggest if it's an exact match (case-insensitive) - that's not helpful
  const isExactMatch = closestMatch?.match.toLowerCase() === invalidValue.toLowerCase();
  const suggestion =
    closestMatch?.isGoodMatch && !isExactMatch ? `\n  Did you mean "${closestMatch.match}"?` : '';
  return `${message}${suggestion}`;
}

// Re-export for potential direct use
export { compareTwoStrings };
