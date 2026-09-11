import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocks
import {
  GithubSetPrReviewThreadResolutionTool,
  GithubSetPrReviewThreadResolutionToolParams,
  GithubSetPrReviewThreadResolutionToolSchema,
} from './set-pr-review-thread-resolution-tool';

// Mock thread response
const mockResolvedThread = {
  id: 'PRRT_kwDOABC123_456',
  isResolved: true,
  viewerCanResolve: false,
  viewerCanUnresolve: true,
};

const mockUnresolvedThread = {
  id: 'PRRT_kwDOABC123_456',
  isResolved: false,
  viewerCanResolve: true,
  viewerCanUnresolve: false,
};

describe('GithubSetPrReviewThreadResolutionTool', () => {
  let tool: GithubSetPrReviewThreadResolutionTool;

  // Example valid parameters for testing
  const validResolveParams: GithubSetPrReviewThreadResolutionToolParams = {
    threadId: 'PRRT_kwDOABC123_456',
    resolved: true,
  };

  const validUnresolveParams: GithubSetPrReviewThreadResolutionToolParams = {
    threadId: 'PRRT_kwDOABC123_456',
    resolved: false,
  };

  beforeEach(() => {
    tool = new GithubSetPrReviewThreadResolutionTool();
    mocks.graphql.mockReset();
  });

  it('should be defined', () => {
    expect(tool).toBeDefined();
  });

  describe('schema validation', () => {
    it('should validate correct resolve parameters', () => {
      const result = GithubSetPrReviewThreadResolutionToolSchema.safeParse(validResolveParams);
      expect(result.success).toBe(true);
    });

    it('should validate correct unresolve parameters', () => {
      const result = GithubSetPrReviewThreadResolutionToolSchema.safeParse(validUnresolveParams);
      expect(result.success).toBe(true);
    });

    it('should reject missing threadId', () => {
      const invalidParams = { resolved: true };
      const result = GithubSetPrReviewThreadResolutionToolSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should reject missing resolved', () => {
      const invalidParams = { threadId: 'PRRT_kwDOABC123_456' };
      const result = GithubSetPrReviewThreadResolutionToolSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should reject invalid threadId type', () => {
      const invalidParams = { threadId: 123, resolved: true };
      const result = GithubSetPrReviewThreadResolutionToolSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should reject invalid resolved type', () => {
      const invalidParams = {
        threadId: 'PRRT_kwDOABC123_456',
        resolved: 'yes',
      };
      const result = GithubSetPrReviewThreadResolutionToolSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });
  });

  describe('execute - resolve thread', () => {
    it('should execute resolve mutation and return success', async () => {
      mocks.graphql.mockImplementation(async () => ({
        resolveReviewThread: {
          thread: mockResolvedThread,
        },
      }));

      const result = await tool.execute(validResolveParams);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.action).toBe('resolved');
      expect(parsed.thread.id).toBe(mockResolvedThread.id);
      expect(parsed.thread.isResolved).toBe(true);
    });

    it('should call GraphQL API with correct mutation for resolve', async () => {
      mocks.graphql.mockImplementation(async () => ({
        resolveReviewThread: { thread: mockResolvedThread },
      }));

      await tool.execute(validResolveParams);

      expect(mocks.graphql).toHaveBeenCalled();
      const calls = mocks.graphql.mock.calls as unknown[][];
      const [query, variables] = calls[0] as [string, { threadId: string }];
      expect(query).toContain('resolveReviewThread');
      expect(variables.threadId).toBe(validResolveParams.threadId);
    });
  });

  describe('execute - unresolve thread', () => {
    it('should execute unresolve mutation and return success', async () => {
      mocks.graphql.mockImplementation(async () => ({
        unresolveReviewThread: {
          thread: mockUnresolvedThread,
        },
      }));

      const result = await tool.execute(validUnresolveParams);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.action).toBe('unresolved');
      expect(parsed.thread.isResolved).toBe(false);
    });

    it('should call GraphQL API with correct mutation for unresolve', async () => {
      mocks.graphql.mockImplementation(async () => ({
        unresolveReviewThread: { thread: mockUnresolvedThread },
      }));

      await tool.execute(validUnresolveParams);

      expect(mocks.graphql).toHaveBeenCalled();
      const calls = mocks.graphql.mock.calls as unknown[][];
      const [query, variables] = calls[0] as [string, { threadId: string }];
      expect(query).toContain('unresolveReviewThread');
      expect(variables.threadId).toBe(validUnresolveParams.threadId);
    });
  });

  describe('error handling', () => {
    it('should throw error when GraphQL call fails', async () => {
      mocks.graphql.mockImplementation(async () => {
        throw new Error('GraphQL request failed');
      });

      let error;
      try {
        await tool.execute(validResolveParams);
      } catch (e: any) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('GraphQL request failed');
    });
  });
});
