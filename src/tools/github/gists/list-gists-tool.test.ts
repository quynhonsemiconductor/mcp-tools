import { beforeEach, describe, expect, test } from 'bun:test';
import { MOCK_DATA, resetGitHubMocks, setupGitHubMocks } from '../__test__/test-utils';
import { GithubGistListSchema, GithubGistListTool } from './list-gists-tool';

describe('GithubGistListTool', () => {
  let listGistTool: GithubGistListTool;
  let mocks: ReturnType<typeof setupGitHubMocks>;

  beforeEach(() => {
    mocks = setupGitHubMocks();
    resetGitHubMocks(mocks);
    listGistTool = new GithubGistListTool();
  });

  test('should have the correct parameters schema', () => {
    const params = {
      username: 'testuser',
      since: '2023-01-01T00:00:00Z',
      per_page: 20,
      page: 1,
    };

    expect(() => GithubGistListSchema.parse(params)).not.toThrow();
  });

  test('should correctly call GitHub API for authenticated user gists', async () => {
    // Setup
    mocks.gists.list.mockResolvedValue({ data: MOCK_DATA.gists });

    // Execute
    const result = await listGistTool.execute({});

    // Verify
    expect(mocks.gists.list).toHaveBeenCalledWith({
      since: undefined,
      per_page: 10,
      page: 1,
    });
    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
    expect(parsed[0].id).toBe('abc123def456');
  });

  test('should correctly call GitHub API for specific user gists', async () => {
    // Setup
    mocks.gists.listForUser.mockResolvedValue({ data: MOCK_DATA.gists });

    // Execute
    const result = await listGistTool.execute({
      username: 'testuser',
      since: '2023-01-01T00:00:00Z',
      per_page: 20,
      page: 2,
    });

    // Verify
    expect(mocks.gists.listForUser).toHaveBeenCalledWith({
      username: 'testuser',
      since: '2023-01-01T00:00:00Z',
      per_page: 20,
      page: 2,
    });
    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
    expect(parsed[0].id).toBe('abc123def456');
  });

  test('should return a JSON string with the gists data', async () => {
    // Setup
    mocks.gists.list.mockResolvedValue({ data: MOCK_DATA.gists });

    // Execute
    const result = await listGistTool.execute({} as any);

    // Verify
    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
    expect(parsed[0].id).toBe('abc123def456');
    expect(parsed[1].id).toBe('def789ghi012');
  });

  test('should validate required parameters', async () => {
    // Test invalid per_page
    expect(listGistTool.execute({ per_page: 0 } as any)).rejects.toThrow();

    // Test invalid page
    expect(listGistTool.execute({ page: 0 } as any)).rejects.toThrow();

    // Test per_page too large
    expect(listGistTool.execute({ per_page: 101 } as any)).rejects.toThrow();
  });

  test('should handle API errors gracefully', async () => {
    // Setup
    const apiError = new Error('API Error');
    mocks.gists.list.mockRejectedValue(apiError);

    // Execute & Verify
    expect(listGistTool.execute({} as any)).rejects.toThrow('API Error');
  });
});
