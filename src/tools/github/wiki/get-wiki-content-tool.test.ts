import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { setupStandardMocks } from '../../../test-utils/mocks';

// Set up standard mocks
setupStandardMocks();

// Mock the git utils
const mockEnsureRepositoryUpToDate = mock(() => Promise.resolve());
void mock.module('../../../utils/git', () => ({
  ensureRepositoryUpToDate: mockEnsureRepositoryUpToDate,
}));

// Import after mocks
import {
  GithubWikiGetContentTool,
  GithubWikiGetContentToolParams,
  GithubWikiGetContentToolSchema,
} from './index';

describe('GithubWikiGetContentTool', () => {
  let tool: GithubWikiGetContentTool;
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let mockExistsSync: ReturnType<typeof spyOn>;
  let mockReadFileSync: ReturnType<typeof spyOn>;

  // Example valid parameters for testing
  const validParams: GithubWikiGetContentToolParams = {
    org: 'test-org',
    repo: 'test-repo',
    page: 'Home.md',
  };

  beforeEach(() => {
    tool = new GithubWikiGetContentTool();
    // Spy on console.log to prevent logs during tests
    consoleLogSpy = spyOn(console, 'log');
    mockEnsureRepositoryUpToDate.mockClear();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    mockExistsSync?.mockRestore();
    mockReadFileSync?.mockRestore();
  });

  it('should be defined', () => {
    expect(tool).toBeDefined();
  });

  it('should execute with valid parameters and always fetch latest content', async () => {
    // Mock fs methods
    mockExistsSync = spyOn(fs, 'existsSync').mockReturnValue(true);
    mockReadFileSync = spyOn(fs, 'readFileSync').mockReturnValue(
      '# Test Wiki Content\n\nThis is test content.',
    );

    const result = await tool.execute(validParams);
    expect(result).toBeDefined();

    const parsed = JSON.parse(result);
    expect(parsed.org).toBe('test-org');
    expect(parsed.repo).toBe('test-repo');
    expect(parsed.page).toBe('Home.md');
    expect(parsed.content).toBe('# Test Wiki Content\n\nThis is test content.');
    expect(parsed.size).toBe(42);

    // Verify git utils was called to ensure latest content
    expect(mockEnsureRepositoryUpToDate).toHaveBeenCalledTimes(1);
    expect(mockEnsureRepositoryUpToDate).toHaveBeenCalledWith(
      {
        repo: 'test-org/test-repo.wiki',
        branch: 'master',
      },
      path.join(os.homedir(), '.qnscmcp', 'wikis', 'test-org', 'test-repo.wiki'),
    );

    // Verify fs methods were called
    expect(mockExistsSync).toHaveBeenCalled();
    expect(mockReadFileSync).toHaveBeenCalled();
  });

  it('should handle non-existent wiki page', async () => {
    mockExistsSync = spyOn(fs, 'existsSync').mockReturnValue(false);

    let error;
    try {
      await tool.execute(validParams);
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('Wiki page "Home.md" not found');
  });

  it('should handle git clone/update errors', async () => {
    mockEnsureRepositoryUpToDate.mockRejectedValueOnce(new Error('Git clone failed'));

    let error;
    try {
      await tool.execute(validParams);
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  describe('schema validation', () => {
    it('should validate correct parameters', () => {
      const result = GithubWikiGetContentToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('should have required fields in schema', () => {
      const schemaShape = GithubWikiGetContentToolSchema.shape;
      expect(Object.keys(schemaShape)).toContain('org');
      expect(Object.keys(schemaShape)).toContain('repo');
      expect(Object.keys(schemaShape)).toContain('page');
    });

    it('should reject missing org', () => {
      const invalidParams = {
        repo: 'test-repo',
        page: 'Home.md',
      };
      const result = GithubWikiGetContentToolSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should reject missing repo', () => {
      const invalidParams = {
        org: 'test-org',
        page: 'Home.md',
      };
      const result = GithubWikiGetContentToolSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should reject missing page', () => {
      const invalidParams = {
        org: 'test-org',
        repo: 'test-repo',
      };
      const result = GithubWikiGetContentToolSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });
  });
});
