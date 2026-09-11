import { beforeEach, describe, expect, test } from 'bun:test';
import { resetGitHubMocks, setupGitHubMocks } from '../__test__/test-utils';
import { GithubGistDeleteSchema, GithubGistDeleteTool } from './delete-gist-tool';

describe('GithubGistDeleteTool', () => {
  let deleteGistTool: GithubGistDeleteTool;
  let mocks: ReturnType<typeof setupGitHubMocks>;

  beforeEach(() => {
    mocks = setupGitHubMocks();
    resetGitHubMocks(mocks);
    deleteGistTool = new GithubGistDeleteTool();
  });

  test('should have the correct parameters schema', () => {
    const params = {
      gist_id: 'abc123',
    };

    expect(() => GithubGistDeleteSchema.parse(params)).not.toThrow();
  });

  test('should correctly call GitHub API with gist ID', async () => {
    // Setup
    mocks.gists.delete.mockResolvedValue({ status: 204 });

    const params = {
      gist_id: 'abc123',
    };

    // Execute
    const result = await deleteGistTool.execute(params);

    // Verify
    expect(mocks.gists.delete).toHaveBeenCalledWith({
      gist_id: 'abc123',
    });

    const parsed = JSON.parse(result);
    expect(parsed.message).toBe('Gist abc123 has been successfully deleted');
    expect(parsed.status).toBe(204);
  });

  test('should return a JSON string with success message', async () => {
    // Setup
    mocks.gists.delete.mockResolvedValue({ status: 204 });

    const params = {
      gist_id: 'test123',
    };

    // Execute
    const result = await deleteGistTool.execute(params);

    // Verify
    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('message');
    expect(parsed).toHaveProperty('status');
    expect(parsed.message).toContain('test123');
    expect(parsed.message).toContain('successfully deleted');
  });

  test('should validate required parameters', async () => {
    // Test missing gist_id
    expect(deleteGistTool.execute({} as any)).rejects.toThrow();

    // Test invalid gist_id type
    expect(deleteGistTool.execute({ gist_id: 123 } as any)).rejects.toThrow();

    // Test empty gist_id
    expect(deleteGistTool.execute({ gist_id: '' })).rejects.toThrow();
  });

  test('should handle API errors gracefully', async () => {
    // Setup
    const apiError = new Error('API Error');
    mocks.gists.delete.mockRejectedValue(apiError);

    const params = {
      gist_id: 'abc123',
    };

    // Execute & Verify
    expect(deleteGistTool.execute(params)).rejects.toThrow('API Error');
  });

  test('should handle 404 not found error', async () => {
    // Setup
    const notFoundError = new Error('Not Found');
    mocks.gists.delete.mockRejectedValue(notFoundError);

    const params = {
      gist_id: 'nonexistent',
    };

    // Execute & Verify
    expect(deleteGistTool.execute(params)).rejects.toThrow('Not Found');
  });
});
