/**
 * Output validation utilities for testing binary command outputs
 */

import type { CommandResult } from './binary-runner';

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether the validation passed */
  passed: boolean;
  /** Description of what was validated */
  message: string;
  /** Expected value (for display) */
  expected?: string;
  /** Actual value (for display) */
  actual?: string;
}

/**
 * Validates that the exit code matches expected
 */
export function validateExitCode(
  result: CommandResult,
  expected: number = 0
): ValidationResult {
  const passed = result.exitCode === expected;
  return {
    passed,
    message: passed
      ? `Exit code is ${expected}`
      : `Exit code mismatch`,
    expected: String(expected),
    actual: String(result.exitCode)
  };
}

/**
 * Validates that stdout contains a string
 */
export function validateContains(
  result: CommandResult,
  substring: string,
  caseSensitive: boolean = false
): ValidationResult {
  const stdout = caseSensitive ? result.stdout : result.stdout.toLowerCase();
  const search = caseSensitive ? substring : substring.toLowerCase();
  const passed = stdout.includes(search);
  
  return {
    passed,
    message: passed
      ? `Output contains "${substring}"`
      : `Output missing "${substring}"`,
    expected: substring,
    actual: passed ? '(found)' : '(not found)'
  };
}

/**
 * Validates that stdout contains all specified strings
 */
export function validateContainsAll(
  result: CommandResult,
  substrings: string[],
  caseSensitive: boolean = false
): ValidationResult {
  const missing: string[] = [];
  const stdout = caseSensitive ? result.stdout : result.stdout.toLowerCase();
  
  for (const substring of substrings) {
    const search = caseSensitive ? substring : substring.toLowerCase();
    if (!stdout.includes(search)) {
      missing.push(substring);
    }
  }
  
  const passed = missing.length === 0;
  return {
    passed,
    message: passed
      ? `Output contains all ${substrings.length} expected strings`
      : `Output missing ${missing.length} strings`,
    expected: substrings.join(', '),
    actual: passed ? '(all found)' : `Missing: ${missing.join(', ')}`
  };
}

/**
 * Validates that stdout matches a regex pattern
 */
export function validatePattern(
  result: CommandResult,
  pattern: RegExp,
  description?: string
): ValidationResult {
  const passed = pattern.test(result.stdout);
  return {
    passed,
    message: passed
      ? `Output matches pattern${description ? `: ${description}` : ''}`
      : `Output doesn't match pattern${description ? `: ${description}` : ''}`,
    expected: pattern.toString(),
    actual: passed ? '(matched)' : '(no match)'
  };
}

/**
 * Validates that stdout is valid JSON
 */
export function validateJSON(result: CommandResult): ValidationResult {
  try {
    JSON.parse(result.stdout.trim());
    return {
      passed: true,
      message: 'Output is valid JSON'
    };
  } catch (error) {
    return {
      passed: false,
      message: 'Output is not valid JSON',
      expected: 'Valid JSON',
      actual: error instanceof Error ? error.message : 'Parse error'
    };
  }
}

/**
 * Validates that stdout is a JSON array with minimum length
 */
export function validateJSONArray(
  result: CommandResult,
  minLength: number = 0
): ValidationResult {
  try {
    const parsed = JSON.parse(result.stdout.trim());
    if (!Array.isArray(parsed)) {
      return {
        passed: false,
        message: 'Output is not a JSON array',
        expected: 'JSON array',
        actual: typeof parsed
      };
    }
    
    const passed = parsed.length >= minLength;
    return {
      passed,
      message: passed
        ? `JSON array has ${parsed.length} items (>= ${minLength})`
        : `JSON array too short`,
      expected: `>= ${minLength} items`,
      actual: `${parsed.length} items`
    };
  } catch (error) {
    return {
      passed: false,
      message: 'Output is not valid JSON',
      expected: 'Valid JSON array',
      actual: error instanceof Error ? error.message : 'Parse error'
    };
  }
}

/**
 * Validates that JSON output contains at least minCount tools.
 * Supports both array format and object with 'tools' property.
 */
export function validateToolCount(
  result: CommandResult,
  minCount: number = 0
): ValidationResult {
  try {
    const parsed = JSON.parse(result.stdout.trim());
    
    // Determine tool count based on structure
    let count: number;
    if (Array.isArray(parsed)) {
      count = parsed.length;
    } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.tools)) {
      count = parsed.tools.length;
    } else if (parsed && typeof parsed === 'object') {
      // Count keys as tools if it's a flat object
      count = Object.keys(parsed).length;
    } else {
      return {
        passed: false,
        message: 'Output is not a valid tools structure',
        expected: 'JSON array or object with tools',
        actual: typeof parsed
      };
    }
    
    const passed = count >= minCount;
    return {
      passed,
      message: passed
        ? `Found ${count} tools (>= ${minCount})`
        : `Tool count too low`,
      expected: `>= ${minCount} tools`,
      actual: `${count} tools`
    };
  } catch (error) {
    return {
      passed: false,
      message: 'Output is not valid JSON',
      expected: 'Valid JSON',
      actual: error instanceof Error ? error.message : 'Parse error'
    };
  }
}

/**
 * Validates semver version format
 */
export function validateSemver(version: string): ValidationResult {
  // Matches: 1.2.3, v1.2.3, 1.2.3-alpha.1, etc.
  const semverPattern = /^v?(\d+)\.(\d+)\.(\d+)(?:-[\w.]+)?(?:\+[\w.]+)?$/;
  const passed = semverPattern.test(version);
  
  return {
    passed,
    message: passed
      ? `Version "${version}" is valid semver`
      : `Version "${version}" is not valid semver`,
    expected: 'X.Y.Z or vX.Y.Z format',
    actual: version
  };
}

/**
 * Validates that output line count is within range
 */
export function validateLineCount(
  result: CommandResult,
  min: number,
  max?: number
): ValidationResult {
  const lines = result.stdout.split('\n').filter(line => line.trim().length > 0);
  const count = lines.length;
  
  const withinMin = count >= min;
  const withinMax = max === undefined || count <= max;
  const passed = withinMin && withinMax;
  
  const expectedStr = max !== undefined
    ? `${min}-${max} lines`
    : `>= ${min} lines`;
  
  return {
    passed,
    message: passed
      ? `Line count (${count}) is within expected range`
      : `Line count (${count}) outside expected range`,
    expected: expectedStr,
    actual: `${count} lines`
  };
}

/**
 * Validates the command did not time out
 */
export function validateNoTimeout(result: CommandResult): ValidationResult {
  return {
    passed: !result.timedOut,
    message: result.timedOut
      ? `Command timed out after ${result.duration.toFixed(0)}ms`
      : `Command completed in ${result.duration.toFixed(0)}ms`
  };
}

/**
 * Validates execution time is under threshold
 */
export function validateDuration(
  result: CommandResult,
  maxMs: number
): ValidationResult {
  const passed = result.duration <= maxMs;
  return {
    passed,
    message: passed
      ? `Duration (${result.duration.toFixed(0)}ms) under threshold`
      : `Duration (${result.duration.toFixed(0)}ms) exceeded threshold`,
    expected: `<= ${maxMs}ms`,
    actual: `${result.duration.toFixed(0)}ms`
  };
}

/**
 * Combines multiple validations - all must pass
 */
export function validateAll(validations: ValidationResult[]): ValidationResult {
  const failed = validations.filter(v => !v.passed);
  const passed = failed.length === 0;
  
  return {
    passed,
    message: passed
      ? `All ${validations.length} validations passed`
      : `${failed.length} of ${validations.length} validations failed`,
    actual: failed.map(v => v.message).join('; ')
  };
}


