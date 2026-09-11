/**
 * Guards the invariant that makes the shared mocks usable.
 *
 * `mock.module()` in Bun is process-global with no scoping or teardown, so the
 * standard mocks are shared state. `setupStandardMocks()` is called from every test
 * file, and it used to mint fresh mock objects on each call and re-point
 * `mock.module('fs')` at them. A file holding the earlier object — the five that do
 * `import { mockFS } from '../test-utils/mocks'` most of all — was then configuring
 * something `fs` no longer resolved to: `mockFS.existsSync.mockReturnValue(...)` set
 * an expectation nothing read, and the code under test saw a pristine mock.
 *
 * It only bit when a rebuilding call landed between a file's setup and its
 * assertions, so it surfaced as order-dependent failures — and because Bun's file
 * order differs per platform, the same commit could pass on macOS and fail on Linux.
 *
 * These tests pin both halves of the fix. Identity must survive a later call, or
 * references go stale again. State must not, or one file's `mockReturnValue` and call
 * counts leak into the next — that isolation is what rebuilding used to provide.
 */
import { describe, expect, it } from 'bun:test';
import fs from 'fs';
import { mockFS, mockOs, mockPath, setupStandardMocks } from './mocks';

describe('standard mock stability', () => {
  it('keeps the same fs/path/os objects across calls', () => {
    const again = setupStandardMocks();

    expect(again.mockFS).toBe(mockFS);
    expect(again.mockPath).toBe(mockPath);
    expect(again.mockOs).toBe(mockOs);
  });

  it('leaves the module registration pointing at the shared object', () => {
    // The registration spreads mockFS, so this is what breaks first when identity
    // churns: fs keeps some other call's functions while tests configure ours.
    setupStandardMocks();

    expect(fs.existsSync).toBe(mockFS.existsSync);
    expect(fs.readFileSync).toBe(mockFS.readFileSync);
  });

  it('lets a configured return value reach the code under test', () => {
    setupStandardMocks();
    mockFS.existsSync.mockReturnValue(true);

    // Reading through the module, not the mock object, is the point: this is the
    // path that silently returned undefined while the test looked correct.
    expect(fs.existsSync('/anything')).toBe(true);
  });

  it('refreshes member state on a later call so files do not inherit it', () => {
    setupStandardMocks();
    mockFS.existsSync.mockReturnValue(true);
    expect(fs.existsSync('/anything')).toBe(true);

    // Stands in for the next test file importing mocks and calling setup: it must
    // not inherit the previous file's configuration.
    setupStandardMocks();

    expect(fs.existsSync('/anything')).toBeUndefined();
    expect(mockFS.existsSync).toBe(fs.existsSync);
  });
});
