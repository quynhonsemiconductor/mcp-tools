import { beforeEach, describe, expect, test } from 'bun:test';
import { MOCK_DATA, resetGitHubMocks, setupGitHubMocks } from '../__test__/test-utils';
import { GithubGistUpdateSchema, GithubGistUpdateTool } from './update-gist-tool';

describe('GithubGistUpdateTool', () => {
  let updateGistTool: GithubGistUpdateTool;
  let mocks: ReturnType<typeof setupGitHubMocks>;

  beforeEach(() => {
    mocks = setupGitHubMocks();
    resetGitHubMocks(mocks);
    updateGistTool = new GithubGistUpdateTool();
  });

  test('should have the correct parameters schema', () => {
    const params = {
      gist_id: 'abc123',
      description: 'Updated description',
      files: {
        'test.js': {
          content: 'console.log("Updated content");',
        },
      },
    };

    expect(() => GithubGistUpdateSchema.parse(params)).not.toThrow();
  });

  test('should correctly call GitHub API with updated description only', async () => {
    // Setup
    mocks.gists.update.mockResolvedValue({ data: MOCK_DATA.gist });

    const params = {
      gist_id: 'abc123',
      description: 'Updated description',
    };

    // Execute
    const result = await updateGistTool.execute(params);

    // Verify
    expect(mocks.gists.update).toHaveBeenCalledWith({
      gist_id: 'abc123',
      description: 'Updated description',
      files: undefined,
    });

    // Verify result structure
    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(parsed.id).toBe(MOCK_DATA.gist.id);
    expect(parsed.description).toBe(MOCK_DATA.gist.description);
    expect(parsed.public).toBe(true);
  });

  test('should correctly call GitHub API with file updates', async () => {
    // Setup
    mocks.gists.update.mockResolvedValue({ data: MOCK_DATA.gist });

    const params = {
      gist_id: 'abc123',
      files: {
        'test.js': {
          content: 'console.log("Updated content");',
        },
        'new_file.py': {
          content: 'print("New file")',
          filename: 'new_file.py',
        },
      },
    };

    // Execute
    const result = await updateGistTool.execute(params);

    // Verify
    expect(mocks.gists.update).toHaveBeenCalledWith({
      gist_id: 'abc123',
      description: undefined,
      files: {
        'test.js': {
          content: 'console.log("Updated content");',
          filename: undefined,
        },
        'new_file.py': {
          content: 'print("New file")',
          filename: 'new_file.py',
        },
      },
    });

    // Verify result structure
    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(parsed.id).toBe(MOCK_DATA.gist.id);
    expect(parsed.description).toBe(MOCK_DATA.gist.description);
    expect(parsed.public).toBe(true);
  });

  test('should handle file deletion', async () => {
    // Setup
    mocks.gists.update.mockResolvedValue({ data: MOCK_DATA.gist });

    const params = {
      gist_id: 'abc123',
      files: {
        'to_delete.txt': null,
        'to_update.js': {
          content: 'Updated content',
        },
      },
    };

    // Execute
    const result = await updateGistTool.execute(params);

    // Verify
    expect(mocks.gists.update).toHaveBeenCalledWith({
      gist_id: 'abc123',
      description: undefined,
      files: {
        'to_delete.txt': null,
        'to_update.js': {
          content: 'Updated content',
          filename: undefined,
        },
      },
    });

    // Verify result structure
    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(parsed.id).toBe(MOCK_DATA.gist.id);
    expect(parsed.description).toBe(MOCK_DATA.gist.description);
    expect(parsed.public).toBe(true);
  });

  test('should handle file renaming', async () => {
    // Setup
    mocks.gists.update.mockResolvedValue({ data: MOCK_DATA.gist });

    const params = {
      gist_id: 'abc123',
      files: {
        'old_name.txt': {
          filename: 'new_name.txt',
          content: 'Same content, new name',
        },
      },
    };

    // Execute
    const result = await updateGistTool.execute(params);

    // Verify
    expect(mocks.gists.update).toHaveBeenCalledWith({
      gist_id: 'abc123',
      description: undefined,
      files: {
        'old_name.txt': {
          filename: 'new_name.txt',
          content: 'Same content, new name',
        },
      },
    });

    // Verify result structure
    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(parsed.id).toBe(MOCK_DATA.gist.id);
    expect(parsed.description).toBe(MOCK_DATA.gist.description);
    expect(parsed.public).toBe(true);
  });

  test('should return a JSON string with the updated gist data', async () => {
    // Setup
    mocks.gists.update.mockResolvedValue({ data: MOCK_DATA.gist });

    const params = {
      gist_id: 'abc123',
      description: 'Updated gist',
    };

    // Execute
    const result = await updateGistTool.execute(params);

    // Verify
    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(parsed.id).toBe(MOCK_DATA.gist.id);
    expect(parsed.description).toBe(MOCK_DATA.gist.description);
    expect(parsed.public).toBe(true);
  });

  test('should validate required parameters', async () => {
    // Test missing gist_id
    expect(updateGistTool.execute({} as any)).rejects.toThrow();

    // Test invalid gist_id type
    expect(updateGistTool.execute({ gist_id: 123 } as any)).rejects.toThrow();
  });

  test('should handle API errors gracefully', async () => {
    // Setup
    const apiError = new Error('API Error');
    mocks.gists.update.mockRejectedValue(apiError);

    const params = {
      gist_id: 'abc123',
      description: 'Updated description',
    };

    // Execute & Verify
    expect(updateGistTool.execute(params)).rejects.toThrow('API Error');
  });
});
