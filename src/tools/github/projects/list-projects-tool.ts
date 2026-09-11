import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the listGithubProjects tool parameters
 */
export const ListGithubProjectsToolSchema = z
  .object({
    org: z
      .string()
      .optional()
      .describe('The organization login name. Provide either org or user, not both.'),
    user: z
      .string()
      .optional()
      .describe('The GitHub username. Provide either org or user, not both.'),
    per_page: z.number().int().min(1).max(100).default(20).describe('Number of projects to return'),
    after: z
      .string()
      .optional()
      .describe('Cursor for pagination to fetch the next page of projects'),
    query: z.string().optional().describe('Filter projects by title search'),
  })
  .refine((data) => (data.org && !data.user) || (!data.org && data.user), {
    message: 'Exactly one of org or user must be provided',
  });

/**
 * Type for the listGithubProjects tool parameters
 */
export type ListGithubProjectsToolParams = z.infer<typeof ListGithubProjectsToolSchema>;

/**
 * Interface for a ProjectV2 node in the GraphQL response
 */
interface ProjectV2Node {
  id: string;
  number: number;
  title: string;
  shortDescription: string | null;
  url: string;
  public: boolean;
  closed: boolean;
  createdAt: string;
  updatedAt: string;
  creator: { login: string } | null;
}

/**
 * Interface for the projectsV2 connection
 */
interface ProjectsV2Connection {
  totalCount: number;
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
  nodes: ProjectV2Node[];
}

/**
 * Interface for the GraphQL response
 */
interface ListProjectsResponse {
  organization?: {
    projectsV2: ProjectsV2Connection;
  } | null;
  user?: {
    projectsV2: ProjectsV2Connection;
  } | null;
}

const ORG_QUERY = `query ListOrgProjects(
  $login: String!
  $perPage: Int!
  $after: String
  $searchQuery: String
) {
  organization(login: $login) {
    projectsV2(first: $perPage, after: $after, query: $searchQuery) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        number
        title
        shortDescription
        url
        public
        closed
        createdAt
        updatedAt
        creator {
          login
        }
      }
    }
  }
}`;

const USER_QUERY = `query ListUserProjects(
  $login: String!
  $perPage: Int!
  $after: String
  $searchQuery: String
) {
  user(login: $login) {
    projectsV2(first: $perPage, after: $after, query: $searchQuery) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        number
        title
        shortDescription
        url
        public
        closed
        createdAt
        updatedAt
        creator {
          login
        }
      }
    }
  }
}`;

/**
 * listGithubProjects - Lists Projects V2 for an organization or user
 */
@Tool({
  id: 'github-projects-list',
  name: 'listGithubProjects',
  description:
    'Lists GitHub Projects V2 for an organization or user. Provide either org or user parameter. Returns project titles, IDs, and metadata with pagination support.',
  category: 'Github: Projects',
  parameters: ListGithubProjectsToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'List GitHub Projects',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class ListGithubProjectsTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: ListGithubProjectsToolParams): Promise<string> {
    const { org, user, per_page: perPage, after, query } = args;
    const client = this.getClient();
    const login = org ?? user!;
    const isOrg = !!org;

    const response = await client.graphql<ListProjectsResponse>(isOrg ? ORG_QUERY : USER_QUERY, {
      login,
      perPage,
      after,
      searchQuery: query,
    });

    const owner = isOrg ? response.organization : response.user;

    if (!owner) {
      const ownerType = isOrg ? 'Organization' : 'User';
      throw new Error(`${ownerType} '${login}' not found or inaccessible`);
    }

    const { projectsV2 } = owner;

    return JSON.stringify({
      success: true,
      totalCount: projectsV2.totalCount,
      pageInfo: projectsV2.pageInfo,
      projects: projectsV2.nodes.map((project) => ({
        id: project.id,
        number: project.number,
        title: project.title,
        shortDescription: project.shortDescription,
        url: project.url,
        public: project.public,
        closed: project.closed,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        creator: project.creator?.login ?? null,
      })),
    });
  }
}
