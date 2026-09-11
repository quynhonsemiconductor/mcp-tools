import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the getGithubProject tool parameters
 */
export const GetGithubProjectToolSchema = z
  .object({
    org: z
      .string()
      .optional()
      .describe('The organization login name. Provide either org or user, not both.'),
    user: z
      .string()
      .optional()
      .describe('The GitHub username. Provide either org or user, not both.'),
    project_number: z.number().int().min(1).describe('The project number'),
  })
  .refine((data) => (data.org && !data.user) || (!data.org && data.user), {
    message: 'Exactly one of org or user must be provided',
  });

/**
 * Type for the getGithubProject tool parameters
 */
export type GetGithubProjectToolParams = z.infer<typeof GetGithubProjectToolSchema>;

/**
 * Interface for a ProjectV2 detail
 */
interface ProjectV2Detail {
  id: string;
  number: number;
  title: string;
  shortDescription: string | null;
  url: string;
  public: boolean;
  closed: boolean;
  readme: string | null;
  createdAt: string;
  updatedAt: string;
  creator: { login: string } | null;
  items: { totalCount: number };
  fields: { totalCount: number };
}

/**
 * Interface for the GraphQL response
 */
interface GetProjectResponse {
  organization?: {
    projectV2: ProjectV2Detail | null;
  } | null;
  user?: {
    projectV2: ProjectV2Detail | null;
  } | null;
}

const PROJECT_FIELDS = `
  id
  number
  title
  shortDescription
  url
  public
  closed
  readme
  createdAt
  updatedAt
  creator {
    login
  }
  items {
    totalCount
  }
  fields {
    totalCount
  }
`;

const ORG_QUERY = `query GetOrgProject($login: String!, $projectNumber: Int!) {
  organization(login: $login) {
    projectV2(number: $projectNumber) {
      ${PROJECT_FIELDS}
    }
  }
}`;

const USER_QUERY = `query GetUserProject($login: String!, $projectNumber: Int!) {
  user(login: $login) {
    projectV2(number: $projectNumber) {
      ${PROJECT_FIELDS}
    }
  }
}`;

/**
 * getGithubProject - Gets a single GitHub Project V2 by number
 */
@Tool({
  id: 'github-projects-get',
  name: 'getGithubProject',
  description:
    'Gets a single GitHub Project V2 by number for an organization or user. Provide either org or user parameter. Returns the project node ID needed by other project tools, along with full project details.',
  category: 'Github: Projects',
  parameters: GetGithubProjectToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Get GitHub Project',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GetGithubProjectTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GetGithubProjectToolParams): Promise<string> {
    const { org, user, project_number: projectNumber } = args;
    const client = this.getClient();
    const login = org ?? user!;
    const isOrg = !!org;

    const response = await client.graphql<GetProjectResponse>(isOrg ? ORG_QUERY : USER_QUERY, {
      login,
      projectNumber,
    });

    const owner = isOrg ? response.organization : response.user;
    const ownerType = isOrg ? 'organization' : 'user';

    if (!owner) {
      const ownerLabel = isOrg ? 'Organization' : 'User';
      throw new Error(`${ownerLabel} '${login}' not found or inaccessible`);
    }

    const project = owner.projectV2;

    if (!project) {
      throw new Error(`Project #${projectNumber} not found for ${ownerType} '${login}'`);
    }

    return JSON.stringify({
      success: true,
      project: {
        id: project.id,
        number: project.number,
        title: project.title,
        shortDescription: project.shortDescription,
        url: project.url,
        public: project.public,
        closed: project.closed,
        readme: project.readme,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        creator: project.creator?.login ?? null,
        itemCount: project.items.totalCount,
        fieldCount: project.fields.totalCount,
      },
    });
  }
}
