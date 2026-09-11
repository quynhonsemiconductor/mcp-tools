import fs from 'fs';

/**
 * Reads the last N lines from a file efficiently by seeking near the end.
 * Returns lines in reverse order (newest first).
 */
export function tailLogFile(filePath: string, lines: number): string {
  // Guard against the doubling loop spinning forever: with `lines < 1`,
  // `bytesToRead` starts at 0 and `0 * 2` never grows it. Unreachable today
  // because webserver.ts clamps to >= 1, but exported callers can't be relied
  // on to clamp.
  if (lines < 1) return '';

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  if (fileSize === 0) return '';

  // Start with ~200 bytes per line and double on each underestimate. We need
  // `lines + 1` newlines so we can discard the partial first line and still
  // have `lines` complete lines.
  let bytesToRead = Math.min(fileSize, lines * 200);
  let chunk = '';
  let startPosition = 0;

  const fd = fs.openSync(filePath, 'r');
  try {
    while (true) {
      startPosition = Math.max(0, fileSize - bytesToRead);
      const buffer = Buffer.alloc(bytesToRead);
      fs.readSync(fd, buffer, 0, bytesToRead, startPosition);
      chunk = buffer.toString('utf8');

      const newlineCount = (chunk.match(/\n/g) || []).length;
      if (startPosition === 0 || newlineCount >= lines + 1) break;

      bytesToRead = Math.min(fileSize, bytesToRead * 2);
    }
  } finally {
    fs.closeSync(fd);
  }

  // If we didn't read from the start, discard the first partial line
  if (startPosition > 0) {
    const firstNewline = chunk.indexOf('\n');
    if (firstNewline !== -1) {
      chunk = chunk.slice(firstNewline + 1);
    }
  }

  // Take only the last N lines and reverse so newest lines appear first
  const allLines = chunk.split('\n').filter((line) => line.length > 0);
  const tailLines = allLines.slice(-lines).reverse();

  return tailLines.join('\n');
}
