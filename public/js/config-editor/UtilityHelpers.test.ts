/**
 * UtilityHelpers.test.ts - Unit tests for UtilityHelpers
 *
 * Covers the deepEqual helper, which provides key-order-independent
 * structural equality for plain JSON-like values.
 */

import { describe, expect, it } from 'bun:test';
import { deepEqual } from './UtilityHelpers.js';

describe('deepEqual', () => {
  it('returns true for equal primitives', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual('hello', 'hello')).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
  });

  it('returns false for differing primitives', () => {
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual('hello', 'world')).toBe(false);
    expect(deepEqual(true, false)).toBe(false);
  });

  it('returns true for objects with identical content regardless of key insertion order', () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it('returns false for objects with differing values', () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
  });

  it('returns false for arrays with the same elements in different order', () => {
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
  });

  it('returns true for nested objects that are deeply equal', () => {
    expect(deepEqual({ tools: { include: ['a'], exclude: [] } }, { tools: { include: ['a'], exclude: [] } })).toBe(true);
  });

  it('returns true for deepEqual(null, null)', () => {
    expect(deepEqual(null, null)).toBe(true);
  });

  it('returns false for deepEqual(null, {})', () => {
    expect(deepEqual(null, {})).toBe(false);
  });
});
