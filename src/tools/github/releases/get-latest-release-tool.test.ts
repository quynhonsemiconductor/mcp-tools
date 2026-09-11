import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocks
import {
  GithubGetLatestReleaseSchema,
  GithubGetLatestReleaseTool,
  GithubGetLatestReleaseToolParams,
} from './get-latest-release-tool';

describe('GithubGetLatestReleaseTool', () => {
  let tool: GithubGetLatestReleaseTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.repos.getLatestRelease.mockReset();
    mocks.repos.getLatestRelease.mockImplementation(async () => ({
      data: MOCK_DATA.release,
    }));

    tool = new GithubGetLatestReleaseTool();
  });

  const validParams: GithubGetLatestReleaseToolParams = {
    org: 'testorg',
    repo: 'test-repo',
  };

  it('should validate schema correctly', () => {
    const result = GithubGetLatestReleaseSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should get latest release successfully', async () => {
    const mockRelease = {
      data: MOCK_DATA.release,
    };

    mocks.repos.getLatestRelease.mockResolvedValue(mockRelease);

    const result = await tool.execute(validParams);

    expect(result).toBeDefined();
    expect(typeof result).toBe('string');

    const parsed = JSON.parse(result);
    expect(parsed.tag_name).toBe('v1.0.0');
    expect(parsed.name).toBe('Release v1.0.0');

    expect(mocks.repos.getLatestRelease).toHaveBeenCalledWith({
      owner: 'testorg',
      repo: 'test-repo',
    });
  });

  it('should handle repository with no releases', async () => {
    const error = new Error('Not Found');
    (error as any).status = 404;
    mocks.repos.getLatestRelease.mockRejectedValue(error);

    const result = await tool.execute(validParams);

    expect(result).toBeDefined();
    const parsed = JSON.parse(result);
    expect(parsed.message).toBe('No releases found for testorg/test-repo');
    expect(parsed.error).toBe('Not Found');
  });

  it('should handle other API errors', async () => {
    const error = new Error('API Error');
    (error as any).status = 500;
    mocks.repos.getLatestRelease.mockRejectedValue(error);

    expect(tool.execute(validParams)).rejects.toThrow('API Error');
  });
});
