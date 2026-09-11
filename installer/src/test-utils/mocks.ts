import { afterEach, beforeAll, mock } from 'bun:test';
import { EventEmitter } from 'events';

/**
 * Installer test mocks - follows patterns from src/test-utils/mocks.ts
 *
 * These mocks are specific to the installer package but follow the same
 * conventions as the main codebase's test utilities.
 *
 * Key principles:
 * - Prefer spyOn for per-test mocks (automatically restored via mock.restore())
 * - Use mock.module only for external dependencies that need consistent behavior
 * - Reset mocks between tests to prevent leakage
 */

// Mock sudo-prompt for elevated privilege operations
export const mockSudoExec = mock(
  (cmd: string, options: any, callback: (error?: Error) => void) => {
    callback();
  }
);

mock.module('@vscode/sudo-prompt', () => ({
  exec: mockSudoExec,
}));

// Mock child_process.exec for shell commands
export const mockExec = mock(
  (cmd: string, callback: (error: Error | null) => void) => {
    callback(null);
  }
);

// Mock child_process.spawn for process spawning
export const mockSpawn = mock(() => {
  const emitter = new EventEmitter() as any;
  emitter.stdout = new EventEmitter();
  emitter.stderr = new EventEmitter();
  return emitter;
});

mock.module('child_process', () => ({
  exec: mockExec,
  spawn: mockSpawn,
}));

/**
 * Creates a mock HTTPS response with EventEmitter capabilities
 */
export function createMockHttpResponse(statusCode: number, headers: Record<string, string> = {}) {
  const response = new EventEmitter() as any;
  response.statusCode = statusCode;
  response.headers = headers;
  return response;
}

/**
 * Creates a mock HTTPS request with standard methods
 */
export function createMockHttpRequest() {
  const request = new EventEmitter() as any;
  request.setTimeout = mock(() => {});
  request.end = mock(() => {});
  return request;
}

/**
 * Helper to setup standard mocks - call in beforeEach to ensure clean state
 */
export function setupInstallerMocks() {
  return {
    mockSudoExec,
    mockExec,
    mockSpawn,
  };
}

/**
 * Reset all installer mocks - automatically called via afterEach
 */
export function resetInstallerMocks() {
  mockSudoExec.mockClear();
  mockExec.mockClear();
  mockSpawn.mockClear();
}

// Global setup
beforeAll(() => {
  // Global installer test setup
});

// Clean up mock state between tests
afterEach(() => {
  mock.restore();
});
