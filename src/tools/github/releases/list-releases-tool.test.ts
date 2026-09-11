import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocks
import {
  GithubListReleasesSchema,
  GithubListReleasesTool,
  GithubListReleasesToolParams,
} from './list-releases-tool';

describe('GithubListReleasesTool', () => {
  let tool: GithubListReleasesTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.repos.listReleases.mockReset();
    mocks.repos.listReleases.mockImplementation(async () => ({
      data: MOCK_DATA.releases,
    }));

    // Create a fresh instance for each test
    tool = new GithubListReleasesTool();
  });

  const validParams: GithubListReleasesToolParams = {
    org: 'testorg',
    repo: 'test-repo',
  };

  it('should be defined', () => {
    expect(tool).toBeDefined();
  });

  it('should validate schema correctly', () => {
    const result = GithubListReleasesSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should list releases successfully', async () => {
    const mockReleases = {
      data: MOCK_DATA.releases,
    };

    mocks.repos.listReleases.mockResolvedValue(mockReleases);

    const result = await tool.execute(validParams);

    expect(result).toBeDefined();
    expect(typeof result).toBe('string');

    const parsed = JSON.parse(result);
    expect(parsed.data).toBeDefined();
    expect(Array.isArray(parsed.data)).toBe(true);
    expect(parsed.data).toHaveLength(2);
    expect(parsed.data[0].tag_name).toBe('v2.0.0');
    expect(parsed.data[1].tag_name).toBe('v1.0.0');

    expect(mocks.repos.listReleases).toHaveBeenCalledWith({
      owner: 'testorg',
      repo: 'test-repo',
    });
  });

  it('should handle pagination parameters', async () => {
    const paramsWithPagination = {
      ...validParams,
      page: 2,
      per_page: 10,
    };

    const mockReleases = { data: [] };
    mocks.repos.listReleases.mockResolvedValue(mockReleases);

    await tool.execute(paramsWithPagination);

    expect(mocks.repos.listReleases).toHaveBeenCalledWith({
      owner: 'testorg',
      repo: 'test-repo',
      page: 2,
      per_page: 10,
    });
  });

  it('should handle repository not found', async () => {
    const error = new Error('Not Found');
    (error as any).status = 404;
    mocks.repos.listReleases.mockRejectedValue(error);

    const result = await tool.execute(validParams);

    expect(result).toBeDefined();
    const parsed = JSON.parse(result);
    expect(parsed.message).toBe('Repository testorg/test-repo not found or no access');
    expect(parsed.error).toBe('Not Found');
  });
});
