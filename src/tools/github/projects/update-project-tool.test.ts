import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks } from '../__test__/test-utils';

const mocks = setupGitHubMocks();

import {
  UpdateGithubProjectTool,
  UpdateGithubProjectToolParams,
  UpdateGithubProjectToolSchema,
} from './update-project-tool';

describe('UpdateGithubProjectTool', () => {
  let tool: UpdateGithubProjectTool;

  const validParams: UpdateGithubProjectToolParams = {
    project_id: 'PVT_kwDOTest123',
    title: 'Updated Title',
  };

  const mockResponse = {
    updateProjectV2: {
      projectV2: {
        id: 'PVT_kwDOTest123',
        number: 1,
        title: 'Updated Title',
        shortDescription: 'A test project',
        url: 'https://github.com/orgs/test-org/projects/1',
        public: true,
        closed: false,
        readme: 'Project readme content',
        updatedAt: '2024-03-01T00:00:00Z',
      },
    },
  };

  beforeEach(() => {
    tool = new UpdateGithubProjectTool();
    mocks.graphql.mockReset();
  });

  describe('schema validation', () => {
    it('accepts valid parameters with title', () => {
      const result = UpdateGithubProjectToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('accepts all optional fields', () => {
      const result = UpdateGithubProjectToolSchema.safeParse({
        project_id: 'PVT_test',
        title: 'New Title',
        short_description: 'New desc',
        readme: 'New readme',
        public: true,
        closed: false,
      });
      expect(result.success).toBe(true);
    });

    it('accepts only project_id with no updates', () => {
      const result = UpdateGithubProjectToolSchema.safeParse({
        project_id: 'PVT_test',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing project_id', () => {
      const result = UpdateGithubProjectToolSchema.safeParse({
        title: 'test',
      });
      expect(result.success).toBe(false);
    });
  });

  it('returns the updated project', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.project.id).toBe('PVT_kwDOTest123');
    expect(parsed.project.title).toBe('Updated Title');
    expect(parsed.project.public).toBe(true);
    expect(parsed.project.closed).toBe(false);
  });

  it('calls GraphQL with correct variables', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute({
      project_id: 'PVT_kwDOTest123',
      title: 'New Title',
      short_description: 'New desc',
      public: false,
      closed: true,
    });

    expect(mocks.graphql).toHaveBeenCalled();
    const [query, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect(String(query)).toContain('updateProjectV2');
    expect((variables as any).projectId).toBe('PVT_kwDOTest123');
    expect((variables as any).title).toBe('New Title');
    expect((variables as any).shortDescription).toBe('New desc');
    expect((variables as any).public).toBe(false);
    expect((variables as any).closed).toBe(true);
  });

  it('passes undefined for omitted optional fields', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute(validParams);

    const [, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect((variables as any).shortDescription).toBeUndefined();
    expect((variables as any).readme).toBeUndefined();
    expect((variables as any).public).toBeUndefined();
    expect((variables as any).closed).toBeUndefined();
  });

  it('throws on partial null response', async () => {
    mocks.graphql.mockResolvedValue({ updateProjectV2: null });

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('Failed to update project');
  });

  it('throws on GraphQL error', async () => {
    mocks.graphql.mockRejectedValue(new Error('Project not found'));

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('Project not found');
  });
});
