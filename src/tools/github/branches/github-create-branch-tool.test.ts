import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import {
  GithubCreateBranchTool,
  GithubCreateBranchToolParams,
  GithubCreateBranchToolSchema,
} from './github-create-branch-tool';

describe('GithubCreateBranchTool', () => {
  let tool: GithubCreateBranchTool;

  // Example valid parameters for testing
  const validParams: GithubCreateBranchToolParams = {
    org: 'testorg', // This gets overridden by the org value during transformation
    repo: 'test-repo',
    ref: 'refs/heads/new-branch',
    sha: 'abc123def456',
  };

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.git.createRef.mockReset();
    mocks.git.createRef.mockImplementation(async () => ({
      data: MOCK_DATA.createRefResponse,
    }));

    // Create a fresh instance for each test
    tool = new GithubCreateBranchTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubCreateBranchToolSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubCreateBranchToolSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('ref');
    expect(Object.keys(schemaShape)).toContain('sha');
  });

  it('should correctly call GitHub API with transformed parameters', async () => {
    await tool.execute(validParams);

    expect(mocks.git.createRef).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = (mocks.git.createRef as any).mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'test-repo',
      ref: 'refs/heads/new-branch',
      sha: 'abc123def456',
    } as any);
  });

  it('should return a JSON string with the branch creation data', async () => {
    const result = await tool.execute(validParams);

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.ref).toBe(MOCK_DATA.createRefResponse.ref);
    expect(parsedResult.object).toBeDefined();
    expect(parsedResult.object.sha).toBe(MOCK_DATA.createRefResponse.object.sha);
    // Note: url field is removed by cleanResponse method in base tool
  });

  it('should throw an error for missing required fields', async () => {
    let error;
    try {
      // Missing sha field
      await tool.execute({
        org: 'testorg',
        repo: 'test-repo',
        ref: 'refs/heads/new-branch',
      } as any);
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should throw an error for completely invalid input', async () => {
    let error;
    try {
      // Missing all required fields
      await tool.execute({} as any);
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.git.createRef.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute(validParams);
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });

  describe('schema validation', () => {
    it('should validate correct parameters', () => {
      const result = GithubCreateBranchToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('should reject invalid parameters', () => {
      const invalidParams = {
        org: 'testorg',
        repo: 'test-repo',
        ref: 123, // Invalid: number instead of string
        sha: 'abc123def456',
      };
      const result = GithubCreateBranchToolSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should require all mandatory fields', () => {
      const incompleteParams = {
        org: 'testorg',
        repo: 'test-repo',
        // Missing required fields: owner, ref, sha
      };
      const result = GithubCreateBranchToolSchema.safeParse(incompleteParams);
      expect(result.success).toBe(false);
    });
  });

  describe('parameter validation', () => {
    it('should accept valid ref formats', () => {
      const validRefs = [
        'refs/heads/feature-branch',
        'refs/heads/fix/bug-123',
        'refs/heads/development',
        'refs/heads/release/v1.0.0',
      ];

      validRefs.forEach((ref) => {
        const params = { ...validParams, ref };
        const result = GithubCreateBranchToolSchema.safeParse(params);
        expect(result.success).toBe(true);
      });
    });

    it('should accept valid SHA formats', () => {
      const validShas = [
        'abc123def456',
        '1234567890abcdef1234567890abcdef12345678',
        'a1b2c3d4e5f6',
      ];

      validShas.forEach((sha) => {
        const params = { ...validParams, sha };
        const result = GithubCreateBranchToolSchema.safeParse(params);
        expect(result.success).toBe(true);
      });
    });

    it('should accept empty strings (current schema behavior)', () => {
      const emptyFields = ['org', 'org', 'repo', 'ref', 'sha'];

      emptyFields.forEach((field) => {
        const params = { ...validParams, [field]: '' };
        const result = GithubCreateBranchToolSchema.safeParse(params);
        expect(result.success).toBe(true); // Current schema allows empty strings
      });
    });
  });

  describe('API parameter transformation', () => {
    it('should send org as the API owner, and not require it twice', async () => {
      // parseAndTransformGitHubParams maps org to the owner the REST client wants.
      // The schema used to declare an `owner` of its own on top of that, so the
      // organisation had to be supplied twice under two names or the call failed.
      await tool.execute(validParams);

      const apiParams = (mocks.git.createRef as unknown as { mock: { calls: unknown[][] } }).mock
        .calls[0][0] as Record<string, unknown>;
      expect(apiParams.owner).toBe(validParams.org);
      expect(validParams).not.toHaveProperty('owner');
    });

    it('should preserve all required parameters', () => {
      const requiredFields = ['org', 'repo', 'ref', 'sha'];
      requiredFields.forEach((field) => {
        expect(validParams).toHaveProperty(field);
        expect(validParams[field as keyof GithubCreateBranchToolParams]).toBeTruthy();
      });
    });
  });
});
