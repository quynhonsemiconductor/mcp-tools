import { beforeEach, describe, expect, test } from 'bun:test';
import { MOCK_DATA, resetGitHubMocks, setupGitHubMocks } from '../__test__/test-utils';
import { GithubGistCreateSchema, GithubGistCreateTool } from './create-gist-tool';

describe('GithubGistCreateTool', () => {
  let createGistTool: GithubGistCreateTool;
  let mocks: ReturnType<typeof setupGitHubMocks>;

  beforeEach(() => {
    mocks = setupGitHubMocks();
    resetGitHubMocks(mocks);
    createGistTool = new GithubGistCreateTool();
  });

  test('should have the correct parameters schema', () => {
    const params = {
      description: 'Test gist',
      files: {
        'test.js': {
          filename: 'test.js',
          content: 'console.log("Hello World");',
        },
      },
      public: true,
    };

    expect(() => GithubGistCreateSchema.parse(params)).not.toThrow();
  });

  test('should correctly call GitHub API with required parameters', async () => {
    // Setup
    mocks.gists.create.mockResolvedValue({ data: MOCK_DATA.gist });

    const params = {
      description: 'Test gist',
      files: {
        'test.js': {
          filename: 'test.js',
          content: 'console.log("Hello World");',
        },
      },
    };

    // Execute
    const result = await createGistTool.execute(params);

    // Verify
    expect(mocks.gists.create).toHaveBeenCalledWith({
      description: 'Test gist',
      files: {
        'test.js': {
          content: 'console.log("Hello World");',
        },
      },
      public: true,
    });
    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(parsed.id).toBe('abc123def456');
    expect(parsed.description).toBe('Test gist for demonstration');
  });

  test('should correctly call GitHub API with private gist', async () => {
    // Setup
    mocks.gists.create.mockResolvedValue({ data: MOCK_DATA.gist });

    const params = {
      description: 'Private test gist',
      files: {
        'secret.txt': {
          filename: 'secret.txt',
          content: 'This is secret content',
        },
      },
      public: false,
    };

    // Execute
    const result = await createGistTool.execute(params);

    // Verify
    expect(mocks.gists.create).toHaveBeenCalledWith({
      description: 'Private test gist',
      files: {
        'secret.txt': {
          content: 'This is secret content',
        },
      },
      public: false,
    });

    // Verify result structure
    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(parsed.id).toBe(MOCK_DATA.gist.id);
    expect(parsed.description).toBe(MOCK_DATA.gist.description);
    expect(parsed.public).toBe(true); // cleanResponse keeps original value
  });

  test('should handle multiple files', async () => {
    // Setup
    mocks.gists.create.mockResolvedValue({ data: MOCK_DATA.gist });

    const params = {
      description: 'Multi-file gist',
      files: {
        'file1.js': {
          filename: 'file1.js',
          content: 'console.log("File 1");',
        },
        'file2.py': {
          filename: 'file2.py',
          content: 'print("File 2")',
        },
      },
      public: true, // Add explicit public parameter
    };

    // Execute
    const result = await createGistTool.execute(params);

    // Verify
    expect(mocks.gists.create).toHaveBeenCalledWith({
      description: 'Multi-file gist',
      files: {
        'file1.js': {
          content: 'console.log("File 1");',
        },
        'file2.py': {
          content: 'print("File 2")',
        },
      },
      public: true,
    });

    // Verify result structure
    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(parsed.id).toBe(MOCK_DATA.gist.id);
    expect(parsed.description).toBe(MOCK_DATA.gist.description);
    expect(parsed.public).toBe(true);
  });

  test('should return a JSON string with the created gist data', async () => {
    // Setup
    mocks.gists.create.mockResolvedValue({ data: MOCK_DATA.gist });

    const params = {
      files: {
        'test.txt': {
          filename: 'test.txt',
          content: 'Test content',
        },
      },
      public: true,
    };

    // Execute
    const result = await createGistTool.execute(params);

    // Verify
    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(parsed.id).toBe(MOCK_DATA.gist.id);
    expect(parsed.description).toBe(MOCK_DATA.gist.description);
    expect(parsed.public).toBe(true);
  });

  test('should validate required parameters', async () => {
    // Test missing files
    expect(createGistTool.execute({} as any)).rejects.toThrow();

    // Test empty files object
    expect(createGistTool.execute({ files: {} } as any)).rejects.toThrow();
  });

  test('should handle API errors gracefully', async () => {
    // Setup
    const apiError = new Error('API Error');
    mocks.gists.create.mockRejectedValue(apiError);

    const params = {
      files: {
        'test.txt': {
          filename: 'test.txt',
          content: 'Test content',
        },
      },
      public: true,
    };

    // Execute & Verify
    expect(createGistTool.execute(params)).rejects.toThrow('API Error');
  });
});
