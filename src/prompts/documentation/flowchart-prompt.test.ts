import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';

import { setupStandardMocks } from '../../test-utils/mocks';
setupStandardMocks();

import { FlowchartPrompt } from './flowchart-prompt';

describe('FlowchartPrompt', () => {
  // Mock the Bun.file API
  const mockFileText = mock(() => Promise.resolve('mock file content'));
  const mockEmptyFileText = mock(() => Promise.resolve(''));
  const mockErrorFileText = mock(() => Promise.reject(new Error('File not found')));

  // Setup original Bun.file method to restore later
  const originalFile = Bun.file;

  beforeEach(() => {
    // Reset mocks between tests
    mockFileText.mockClear();
    mockEmptyFileText.mockClear();
    mockErrorFileText.mockClear();
  });

  afterAll(() => {
    // Restore original Bun.file
    Bun.file = originalFile;
  });

  it('should build prompt template with file content placeholder', async () => {
    // Setup mock for successful file read
    // @ts-expect-error: Mocking the Bun.file method
    Bun.file = mock(() => {
      return {
        text: mockFileText,
      };
    });

    const flowchart = new FlowchartPrompt();
    const result = await flowchart.load({ file_path: 'test/file.ts' });

    // Verify file was requested
    expect(Bun.file).toHaveBeenCalledWith('test/file.ts');
    expect(mockFileText).toHaveBeenCalled();

    // Check that the result contains the essential parts without checking entire template
    expect(result).toContain('<source_code>');

    // Check that file content was inserted into the template
    expect(result).toContain('mock file content');
  });

  it('should throw error when file content is empty', async () => {
    // Setup mock for empty file
    // @ts-expect-error: Mocking the Bun.file method
    Bun.file = mock(() => {
      return {
        text: mockEmptyFileText,
      };
    });

    const flowchart = new FlowchartPrompt();

    // Expect the load method to throw an error
    expect(flowchart.load({ file_path: 'empty/file.ts' })).rejects.toThrow(
      'No content found at the specified file path: empty/file.ts',
    );

    // Verify file was requested
    expect(Bun.file).toHaveBeenCalledWith('empty/file.ts');
    expect(mockEmptyFileText).toHaveBeenCalled();
  });

  it('should handle errors when file cannot be read', async () => {
    // Setup mock for file read error
    // @ts-expect-error: Mocking the Bun.file method
    Bun.file = mock(() => {
      return {
        text: mockErrorFileText,
      };
    });

    const flowchart = new FlowchartPrompt();

    // Since the CatchErrors decorator is used, the error will be wrapped
    expect(flowchart.load({ file_path: 'nonexistent/file.ts' })).rejects.toThrow();

    // Verify file was requested
    expect(Bun.file).toHaveBeenCalledWith('nonexistent/file.ts');
    expect(mockErrorFileText).toHaveBeenCalled();
  });
});
