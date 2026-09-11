import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { McpCurrentLogResource, McpLogResource } from '.';

// Setup mocks before imports
const mockFS = {
  readdir: mock(() => Promise.resolve(['log1.txt', 'log2.txt'])),
};

void mock.module('fs', () => mockFS);

describe('McpCurrentLogResource', () => {
  let resource: McpCurrentLogResource;
  let originalBunFile: typeof Bun.file;
  let mockText: ReturnType<typeof mock>;

  beforeEach(() => {
    resource = new McpCurrentLogResource();

    // Save original
    originalBunFile = Bun.file;

    // Create mock for file text
    mockText = mock(() => Promise.resolve('Test log content'));

    // Mock implementation
    const mockedFile = (_filePath: string | URL) => {
      return {
        text: mockText,
      } as unknown as ReturnType<typeof originalBunFile>;
    };

    // @ts-expect-error: Override Bun.file for tests
    Bun.file = mockedFile;
  });

  it('should load log file content successfully', async () => {
    const result = await resource.load({});

    expect(mockText).toHaveBeenCalled();
    expect(result).toContain('Log file content from');
    expect(result).toContain('Test log content');

    // Restore original
    Bun.file = originalBunFile;
  });

  it('should handle empty log file content', async () => {
    // Override mock to return empty string
    mockText.mockImplementation(() => Promise.resolve(''));

    const result = await resource.load({});

    expect(mockText).toHaveBeenCalled();
    expect(result).toContain('No content found in the MCP log file');

    // Restore original
    Bun.file = originalBunFile;
  });
});

describe('McpLogResource', () => {
  let resource: McpLogResource;
  let originalBunFile: typeof Bun.file;
  let mockText: ReturnType<typeof mock>;

  beforeEach(() => {
    resource = new McpLogResource();

    // Save originals
    originalBunFile = Bun.file;

    // Create mocks
    mockText = mock(() => Promise.resolve('Specific log content'));

    // Mock implementation for Bun.file
    const mockedFile = (_filePath: string | URL) => {
      return {
        text: mockText,
      } as unknown as ReturnType<typeof originalBunFile>;
    };

    // @ts-expect-error: Override for tests
    Bun.file = mockedFile;
  });

  it('should load specific log file content successfully', async () => {
    const result = await resource.load({
      log_file: 'test-log.txt',
    });

    expect(mockText).toHaveBeenCalled();
    expect(result).toContain('Log file content from');
    expect(result).toContain('Specific log content');

    // Restore originals
    Bun.file = originalBunFile;
  });

  it('should handle empty log file content', async () => {
    // Override mock to return empty string
    mockText.mockImplementation(() => Promise.resolve(''));

    const result = await resource.load({
      log_file: 'empty-log.txt',
    });

    expect(mockText).toHaveBeenCalled();
    expect(result).toContain('No content found in the MCP log file');

    // Restore originals
    Bun.file = originalBunFile;
  });

  // No need to test completion function directly, as it's private to the resource
  // and would be more appropriate to test through integration tests
});
