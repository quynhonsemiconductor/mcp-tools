import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import {
  GithubRepositoryGetContentSchema,
  GithubRepositoryGetContentTool,
} from './get-content-tool';

describe('GithubRepositoryGetContentTool', () => {
  let tool: GithubRepositoryGetContentTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.repos.getContent.mockReset();
    mocks.repos.getContent.mockImplementation(async () => ({
      data: {
        name: 'README.md',
        path: 'README.md',
        sha: 'abc123',
        size: 1024,
        type: 'file',
        content: 'SGVsbG8gV29ybGQ=', // "Hello World" in base64
        encoding: 'base64',
      },
    }));

    // Create a fresh instance for each test
    tool = new GithubRepositoryGetContentTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubRepositoryGetContentSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubRepositoryGetContentSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('path');
    expect(Object.keys(schemaShape)).toContain('ref');
  });

  it('should correctly call GitHub API with required parameters', async () => {
    await tool.execute({
      org: 'testowner',
      repo: 'testrepo',
      path: 'README.md',
    });

    expect(mocks.repos.getContent).toHaveBeenCalled();

    // Check that parameters were properly passed
    const mockCalls = (mocks.repos.getContent as any).mock?.calls;
    if (mockCalls && mockCalls.length > 0) {
      const apiParams = mockCalls[0][0];
      expect(apiParams).toEqual({
        owner: 'testowner',
        repo: 'testrepo',
        path: 'README.md',
      } as any);
    }
  });

  it('should correctly call GitHub API with optional ref parameter', async () => {
    await tool.execute({
      org: 'testowner',
      repo: 'testrepo',
      path: 'src/index.js',
      ref: 'develop',
    });

    expect(mocks.repos.getContent).toHaveBeenCalled();

    // Check that parameters were properly passed including ref
    const mockCalls = (mocks.repos.getContent as any).mock?.calls;
    if (mockCalls && mockCalls.length > 0) {
      const apiParams = mockCalls[0][0];
      expect(apiParams).toEqual({
        owner: 'testowner',
        repo: 'testrepo',
        path: 'src/index.js',
        ref: 'develop',
      } as any);
    }
  });

  it('should return a JSON string with the file content data', async () => {
    const result = await tool.execute({
      org: 'testowner',
      repo: 'testrepo',
      path: 'README.md',
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.name).toBe('README.md');
    expect(parsedResult.path).toBe('README.md');
    expect(parsedResult.type).toBe('file');
    expect(parsedResult.content).toBe('Hello World');
    expect(parsedResult.encoding).toBe('utf-8');
  });

  it('should handle directory content', async () => {
    // Mock directory response
    (mocks.repos.getContent as any).mockImplementation(async () => ({
      data: [
        {
          name: 'file1.js',
          path: 'src/file1.js',
          type: 'file',
          sha: 'def456',
        },
        {
          name: 'file2.js',
          path: 'src/file2.js',
          type: 'file',
          sha: 'ghi789',
        },
      ],
    }));

    const result = await tool.execute({
      org: 'testowner',
      repo: 'testrepo',
      path: 'src',
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(Array.isArray(parsedResult)).toBe(true);
    expect(parsedResult).toHaveLength(2);
    expect(parsedResult[0].name).toBe('file1.js');
    expect(parsedResult[1].name).toBe('file2.js');
  });

  it('should validate required parameters', () => {
    // Validate that schema correctly enforces required parameters
    const result1 = GithubRepositoryGetContentSchema.safeParse({});
    expect(result1.success).toBe(false);
    if (!result1.success) {
      expect(result1.error.issues.some((issue: any) => issue.path.includes('org'))).toBe(true);
      expect(result1.error.issues.some((issue: any) => issue.path.includes('repo'))).toBe(true);
      expect(result1.error.issues.some((issue: any) => issue.path.includes('path'))).toBe(true);
    }

    const result2 = GithubRepositoryGetContentSchema.safeParse({
      org: 'testowner',
      repo: 'testrepo',
    });
    expect(result2.success).toBe(false);
    if (!result2.success) {
      expect(result2.error.issues.some((issue: any) => issue.path.includes('path'))).toBe(true);
    }

    const result3 = GithubRepositoryGetContentSchema.safeParse({
      org: 'testowner',
      repo: 'testrepo',
      path: 'README.md',
    });
    expect(result3.success).toBe(true);
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    (mocks.repos.getContent as any).mockImplementation(() => {
      throw new Error('File not found');
    });

    let error;
    try {
      await tool.execute({
        org: 'testowner',
        repo: 'testrepo',
        path: 'nonexistent.txt',
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('File not found');
  });

  it('should normalize root path "/" to empty string', async () => {
    (mocks.repos.getContent as any).mockImplementation(async () => ({
      data: [{ name: 'README.md', path: 'README.md', type: 'file', sha: 'abc123' }],
    }));

    await tool.execute({
      org: 'testowner',
      repo: 'testrepo',
      path: '/',
    });

    const mockCalls = (mocks.repos.getContent as any).mock?.calls;
    expect(mockCalls).toHaveLength(1);
    const apiParams = mockCalls[0][0];
    expect(apiParams.path).toBe('');
  });
});
