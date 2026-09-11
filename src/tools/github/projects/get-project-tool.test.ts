import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks, MOCK_DATA } from '../__test__/test-utils';

const mocks = setupGitHubMocks();

import {
  GetGithubProjectTool,
  GetGithubProjectToolParams,
  GetGithubProjectToolSchema,
} from './get-project-tool';

describe('GetGithubProjectTool', () => {
  let tool: GetGithubProjectTool;

  const validParams: GetGithubProjectToolParams = {
    org: 'test-org',
    project_number: 1,
  };

  const mockProjectData = {
    ...MOCK_DATA.projectV2,
    readme: 'Project readme content',
    items: { totalCount: 15 },
    fields: { totalCount: 5 },
  };

  const mockResponse = {
    organization: {
      projectV2: mockProjectData,
    },
  };

  beforeEach(() => {
    tool = new GetGithubProjectTool();
    mocks.graphql.mockReset();
  });

  describe('schema validation', () => {
    it('accepts org parameter', () => {
      const result = GetGithubProjectToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('accepts user parameter', () => {
      const result = GetGithubProjectToolSchema.safeParse({
        user: 'test-user',
        project_number: 1,
      });
      expect(result.success).toBe(true);
    });

    it('rejects when both org and user are provided', () => {
      const result = GetGithubProjectToolSchema.safeParse({
        org: 'test-org',
        user: 'test-user',
        project_number: 1,
      });
      expect(result.success).toBe(false);
    });

    it('rejects when neither org nor user is provided', () => {
      const result = GetGithubProjectToolSchema.safeParse({
        project_number: 1,
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing project_number', () => {
      const result = GetGithubProjectToolSchema.safeParse({
        org: 'test-org',
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-positive project number', () => {
      const result = GetGithubProjectToolSchema.safeParse({
        org: 'test-org',
        project_number: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  it('returns full project details for org', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.project.id).toBe('PVT_kwDOTest123');
    expect(parsed.project.number).toBe(1);
    expect(parsed.project.title).toBe('Test Project');
    expect(parsed.project.readme).toBe('Project readme content');
    expect(parsed.project.itemCount).toBe(15);
    expect(parsed.project.fieldCount).toBe(5);
    expect(parsed.project.creator).toBe('testuser');
  });

  it('returns full project details for user', async () => {
    mocks.graphql.mockResolvedValue({
      user: { projectV2: mockProjectData },
    });

    const output = await tool.execute({
      user: 'test-user',
      project_number: 1,
    });
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.project.id).toBe('PVT_kwDOTest123');
    expect(parsed.project.title).toBe('Test Project');
  });

  it('calls GraphQL with organization query for org param', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute(validParams);

    expect(mocks.graphql).toHaveBeenCalled();
    const [query, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect(String(query)).toContain('organization(login:');
    expect((variables as any).login).toBe('test-org');
    expect((variables as any).projectNumber).toBe(1);
  });

  it('calls GraphQL with user query for user param', async () => {
    mocks.graphql.mockResolvedValue({
      user: { projectV2: mockProjectData },
    });

    await tool.execute({ user: 'test-user', project_number: 3 });

    expect(mocks.graphql).toHaveBeenCalled();
    const [query, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect(String(query)).toContain('user(login:');
    expect((variables as any).login).toBe('test-user');
    expect((variables as any).projectNumber).toBe(3);
  });

  it('throws when organization is not found', async () => {
    mocks.graphql.mockResolvedValue({ organization: null });

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain("Organization 'test-org' not found");
  });

  it('throws when user is not found', async () => {
    mocks.graphql.mockResolvedValue({ user: null });

    let error: Error | undefined;
    try {
      await tool.execute({ user: 'nonexistent', project_number: 1 });
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain("User 'nonexistent' not found");
  });

  it('throws when project is not found for org', async () => {
    mocks.graphql.mockResolvedValue({
      organization: { projectV2: null },
    });

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain("Project #1 not found for organization 'test-org'");
  });

  it('throws when project is not found for user', async () => {
    mocks.graphql.mockResolvedValue({
      user: { projectV2: null },
    });

    let error: Error | undefined;
    try {
      await tool.execute({ user: 'test-user', project_number: 99 });
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain("Project #99 not found for user 'test-user'");
  });

  it('handles null creator gracefully', async () => {
    mocks.graphql.mockResolvedValue({
      organization: {
        projectV2: {
          ...MOCK_DATA.projectV2,
          creator: null,
          items: { totalCount: 0 },
          fields: { totalCount: 0 },
        },
      },
    });

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.project.creator).toBeNull();
  });
});
