import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import { GithubGistGetSchema, GithubGistGetTool } from './get-gist-tool';

describe('GithubGistGetTool', () => {
  let tool: GithubGistGetTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.gists.get.mockReset();
    mocks.gists.get.mockImplementation(async () => ({
      data: {
        id: 'test-gist-id',
        description: 'Test gist',
        public: true,
        files: {
          'test.js': {
            filename: 'test.js',
            type: 'application/javascript',
            language: 'JavaScript',
            raw_url: 'https://gist.githubusercontent.com/test/raw/test.js',
            size: 25,
            truncated: false,
            content: 'console.log("Hello World");',
            encoding: 'utf-8',
          },
        },
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        owner: MOCK_DATA.gist.user,
      },
    }));

    // Create a fresh instance for each test
    tool = new GithubGistGetTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubGistGetSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubGistGetSchema.shape;
    expect(Object.keys(schemaShape)).toContain('gist_id');
  });

  it('should correctly call GitHub API with gist ID', async () => {
    await tool.execute({
      gist_id: 'test-gist-id',
    });

    expect(mocks.gists.get).toHaveBeenCalled();

    // Check that parameters were properly passed
    const apiParams = mocks.gists.get.mock.calls[0][0];
    expect(apiParams).toEqual({
      gist_id: 'test-gist-id',
    } as any);
  });

  it('should return a JSON string with the gist data', async () => {
    const result = await tool.execute({
      gist_id: 'test-gist-id',
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.id).toBe('test-gist-id');
    expect(parsedResult.description).toBe('Test gist');
    expect(parsedResult.files).toBeDefined();
    expect(parsedResult.files['test.js']).toBeDefined();
    expect(parsedResult.files['test.js'].content).toBe('console.log("Hello World");');
  });

  it('should handle base64 encoded content', async () => {
    // Mock gist with base64 encoded content
    mocks.gists.get.mockImplementation(async () => ({
      data: {
        id: 'test-gist-base64',
        files: {
          'encoded.txt': {
            filename: 'encoded.txt',
            content: 'SGVsbG8gV29ybGQ=', // "Hello World" in base64
            encoding: 'base64',
          },
        },
      },
    }));

    const result = await tool.execute({
      gist_id: 'test-gist-base64',
    });

    const parsedResult = JSON.parse(result);
    expect(parsedResult.files['encoded.txt'].content).toBe('Hello World');
    expect(parsedResult.files['encoded.txt'].encoding).toBe('utf-8');
  });

  it('should validate required parameters', () => {
    // Validate that schema correctly enforces required parameters
    const result1 = GithubGistGetSchema.safeParse({});
    expect(result1.success).toBe(false);
    if (!result1.success) {
      expect(result1.error.issues.some((issue: any) => issue.path.includes('gist_id'))).toBe(true);
    }

    const result2 = GithubGistGetSchema.safeParse({
      gist_id: 'valid-gist-id',
    });
    expect(result2.success).toBe(true);
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    (mocks.gists.get as any).mockImplementation(() => {
      throw new Error('Gist not found');
    });

    let error;
    try {
      await tool.execute({
        gist_id: 'nonexistent-gist',
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('Gist not found');
  });
});
