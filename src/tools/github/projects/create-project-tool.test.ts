import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks } from '../__test__/test-utils';

const mocks = setupGitHubMocks();

import {
  CreateGithubProjectTool,
  CreateGithubProjectToolParams,
  CreateGithubProjectToolSchema,
} from './create-project-tool';

describe('CreateGithubProjectTool', () => {
  let tool: CreateGithubProjectTool;

  const validParams: CreateGithubProjectToolParams = {
    owner_id: 'O_kwDOOrg123',
    title: 'New Project',
  };

  const mockResponse = {
    createProjectV2: {
      projectV2: {
        id: 'PVT_kwDONew123',
        number: 5,
        title: 'New Project',
        url: 'https://github.com/orgs/test-org/projects/5',
        public: false,
        createdAt: '2024-03-01T00:00:00Z',
      },
    },
  };

  beforeEach(() => {
    tool = new CreateGithubProjectTool();
    mocks.graphql.mockReset();
  });

  describe('schema validation', () => {
    it('accepts valid parameters', () => {
      const result = CreateGithubProjectToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('rejects missing owner_id', () => {
      const result = CreateGithubProjectToolSchema.safeParse({
        title: 'test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing title', () => {
      const result = CreateGithubProjectToolSchema.safeParse({
        owner_id: 'O_test',
      });
      expect(result.success).toBe(false);
    });
  });

  it('returns the created project', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.project.id).toBe('PVT_kwDONew123');
    expect(parsed.project.number).toBe(5);
    expect(parsed.project.title).toBe('New Project');
    expect(parsed.project.url).toBe('https://github.com/orgs/test-org/projects/5');
    expect(parsed.project.public).toBe(false);
  });

  it('calls GraphQL with correct variables', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute(validParams);

    expect(mocks.graphql).toHaveBeenCalled();
    const [query, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect(String(query)).toContain('createProjectV2');
    expect((variables as any).ownerId).toBe('O_kwDOOrg123');
    expect((variables as any).title).toBe('New Project');
  });

  it('throws on partial null response', async () => {
    mocks.graphql.mockResolvedValue({ createProjectV2: null });

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('Failed to create project');
  });

  it('throws on GraphQL error', async () => {
    mocks.graphql.mockRejectedValue(new Error('Insufficient permissions'));

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('Insufficient permissions');
  });
});
