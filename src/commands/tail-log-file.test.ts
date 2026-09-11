import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { tailLogFile } from './tail-log-file';

// The global test preload mocks fs, os, and path.
// tailLogFile needs real fs operations, so we restore them via the
// realFs/realOs/realPath references the mock module preserves.
const realFs = (fs as any).realFs || fs;
const realOs = (os as any).realOs || os;
const realPath = (path as any).realPath || path;

describe('tailLogFile', () => {
  let tmpDir: string;
  let logFile: string;

  beforeEach(() => {
    // Restore real fs methods that tailLogFile uses
    spyOn(fs, 'statSync').mockImplementation((...args: any[]) => realFs.statSync(...args));
    spyOn(fs, 'openSync').mockImplementation((...args: any[]) => realFs.openSync(...args));
    spyOn(fs, 'readSync').mockImplementation((...args: any[]) => realFs.readSync(...args));
    spyOn(fs, 'closeSync').mockImplementation((...args: any[]) => realFs.closeSync(...args));

    tmpDir = realFs.mkdtempSync(realPath.join(realOs.tmpdir(), 'mcp-logs-test-'));
    logFile = realPath.join(tmpDir, 'test.log');
  });

  afterEach(() => {
    realFs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return all lines reversed when file is smaller than requested', () => {
    realFs.writeFileSync(logFile, 'line1\nline2\nline3\n');
    const result = tailLogFile(logFile, 1000);
    expect(result).toBe('line3\nline2\nline1');
  });

  it('should return only the last N lines when file has more', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line${i + 1}`);
    realFs.writeFileSync(logFile, lines.join('\n') + '\n');
    const result = tailLogFile(logFile, 5);
    expect(result).toBe('line100\nline99\nline98\nline97\nline96');
  });

  it('should handle a single line file', () => {
    realFs.writeFileSync(logFile, 'only line\n');
    const result = tailLogFile(logFile, 10);
    expect(result).toBe('only line');
  });

  it('should handle empty file', () => {
    realFs.writeFileSync(logFile, '');
    const result = tailLogFile(logFile, 10);
    expect(result).toBe('');
  });

  it('should skip empty lines', () => {
    realFs.writeFileSync(logFile, 'line1\n\n\nline2\n');
    const result = tailLogFile(logFile, 10);
    expect(result).toBe('line2\nline1');
  });

  it('should discard partial first line when reading from middle of file', () => {
    // 5 lines × ~196 bytes ≈ 987 bytes; request 2 lines → bytesToRead=400,
    // startPosition=587 lands mid line 3. The 400-byte window already
    // contains 3 newlines (≥ lines+1), so the doubling loop is NOT entered
    // here — this test covers the partial-first-line discard branch only,
    // which runs because startPosition > 0. The doubling loop itself is
    // covered by 'should expand read window when a single line exceeds the
    // initial estimate'.
    const longLine = (label: string) => `${'A'.repeat(190)}_${label}`;
    const lines = [
      longLine('first'),
      longLine('second'),
      longLine('third'),
      longLine('fourth'),
      longLine('fifth'),
    ];
    realFs.writeFileSync(logFile, lines.join('\n') + '\n');

    const result = tailLogFile(logFile, 2);
    expect(result).toBe(`${longLine('fifth')}\n${longLine('fourth')}`);
  });

  it('should expand read window when a single line exceeds the initial estimate', () => {
    // Regression: a 1000-byte line used to land the read window entirely
    // inside that line, skip the partial-line discard (no newlines in window),
    // and return mid-line garbage as a "complete" entry.
    const huge = 'X'.repeat(1000);
    const lines = ['short1', 'short2', 'short3', 'short4', huge];
    realFs.writeFileSync(logFile, lines.join('\n'));

    const result = tailLogFile(logFile, 2);
    expect(result).toBe(`${huge}\nshort4`);
  });

  it('should handle file without trailing newline', () => {
    realFs.writeFileSync(logFile, 'line1\nline2\nline3');
    const result = tailLogFile(logFile, 10);
    expect(result).toBe('line3\nline2\nline1');
  });

  it('should handle realistic log lines', () => {
    const logLines = [
      '[2026-04-09T10:00:00Z] [INFO] Server started on port 3000',
      '[2026-04-09T10:00:01Z] [DEBUG] Loading configuration',
      '[2026-04-09T10:00:02Z] [ERROR] Failed to connect to database',
    ];
    realFs.writeFileSync(logFile, logLines.join('\n') + '\n');
    const result = tailLogFile(logFile, 2);
    expect(result).toBe(
      '[2026-04-09T10:00:02Z] [ERROR] Failed to connect to database\n' +
        '[2026-04-09T10:00:01Z] [DEBUG] Loading configuration',
    );
  });

  it('should handle requesting exactly 1 line', () => {
    realFs.writeFileSync(logFile, 'first\nsecond\nthird\n');
    const result = tailLogFile(logFile, 1);
    expect(result).toBe('third');
  });

  it('should return empty string when 0 lines requested', () => {
    realFs.writeFileSync(logFile, 'a\nb\nc\n');
    expect(tailLogFile(logFile, 0)).toBe('');
  });

  it('should return empty string when negative lines requested', () => {
    realFs.writeFileSync(logFile, 'a\nb\nc\n');
    expect(tailLogFile(logFile, -5)).toBe('');
  });

  it('should close the file descriptor when readSync throws', () => {
    realFs.writeFileSync(logFile, 'line1\nline2\n');
    const closeSpy = spyOn(fs, 'closeSync').mockImplementation((...args: any[]) =>
      realFs.closeSync(...args),
    );
    spyOn(fs, 'readSync').mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() => tailLogFile(logFile, 5)).toThrow('boom');
    expect(closeSpy).toHaveBeenCalled();
  });
});
