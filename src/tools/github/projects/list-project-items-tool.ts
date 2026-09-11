import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the listGithubProjectItems tool parameters
 */
export const ListGithubProjectItemsToolSchema = z.object({
  project_id: z.string().describe('The node ID of the project (e.g., PVT_kwDOABC123)'),
  per_page: z.number().int().min(1).max(100).default(20).describe('Number of items to return'),
  after: z.string().optional().describe('Cursor for pagination to fetch the next page of items'),
});

/**
 * Type for the listGithubProjectItems tool parameters
 */
export type ListGithubProjectItemsToolParams = z.infer<typeof ListGithubProjectItemsToolSchema>;

/**
 * Interface for field value nodes
 */
interface FieldValueNode {
  __typename: string;
  field?: { name: string } | null;
  text?: string;
  number?: number;
  date?: string;
  name?: string;
  title?: string;
  startDate?: string;
  labels?: { nodes: Array<{ name: string }> };
  milestone?: { title: string } | null;
  users?: { nodes: Array<{ login: string }> };
  pullRequests?: {
    nodes: Array<{ title: string; number: number; url: string }>;
  };
  repository?: { nameWithOwner: string; url: string } | null;
  reviewers?: {
    nodes: Array<{ login?: string; name?: string; slug?: string }>;
  };
}

/**
 * Interface for item content (issue, PR, or draft issue)
 */
interface ItemContent {
  __typename: string;
  id: string;
  title: string;
  number?: number;
  state?: string;
  url?: string;
  body?: string;
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string | null;
  author?: { login: string } | null;
  assignees?: { nodes: Array<{ login: string }> };
  labels?: { nodes: Array<{ name: string }> };
}

/**
 * Interface for a project item node
 */
interface ProjectV2ItemNode {
  id: string;
  type: string;
  isArchived: boolean;
  content: ItemContent | null;
  fieldValues: {
    nodes: FieldValueNode[];
  };
}

/**
 * Interface for the GraphQL response
 */
interface ListProjectItemsResponse {
  node: {
    __typename: string;
    items: {
      totalCount: number;
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      nodes: ProjectV2ItemNode[];
    };
  } | null;
}

/**
 * Maps a field value node into a clean shape
 */
function mapFieldValue(fv: FieldValueNode) {
  const result: Record<string, unknown> = {
    type: fv.__typename,
    fieldName: fv.field?.name ?? null,
  };

  if (fv.text !== undefined) result.text = fv.text;
  if (fv.number !== undefined) result.number = fv.number;
  if (fv.date !== undefined) result.date = fv.date;
  if (fv.name !== undefined) result.name = fv.name;
  if (fv.title !== undefined) result.title = fv.title;
  if (fv.startDate !== undefined) result.startDate = fv.startDate;
  if (fv.labels) result.labels = fv.labels.nodes.map((l) => l.name);
  if (fv.milestone) result.milestone = fv.milestone.title;
  if (fv.users) result.users = fv.users.nodes.map((u) => u.login);
  if (fv.pullRequests)
    result.pullRequests = fv.pullRequests.nodes.map((pr) => ({
      title: pr.title,
      number: pr.number,
      url: pr.url,
    }));
  if (fv.repository)
    result.repository = {
      nameWithOwner: fv.repository.nameWithOwner,
      url: fv.repository.url,
    };
  if (fv.reviewers) result.reviewers = fv.reviewers.nodes.map((r) => r.login ?? r.name ?? r.slug);

  return result;
}

/**
 * Maps a project item node into a clean response shape
 */
function mapItem(item: ProjectV2ItemNode) {
  return {
    id: item.id,
    type: item.type,
    isArchived: item.isArchived,
    content: item.content
      ? {
          type: item.content.__typename,
          id: item.content.id,
          title: item.content.title,
          number: item.content.number ?? null,
          state: item.content.state ?? null,
          url: item.content.url ?? null,
          body: item.content.body ?? null,
          createdAt: item.content.createdAt ?? null,
          updatedAt: item.content.updatedAt ?? null,
          closedAt: item.content.closedAt ?? null,
          author: item.content.author?.login ?? null,
          assignees: item.content.assignees?.nodes?.map((a) => a.login) ?? [],
          labels: item.content.labels?.nodes?.map((l) => l.name) ?? [],
        }
      : null,
    fieldValues: item.fieldValues.nodes.filter((fv) => fv.__typename).map(mapFieldValue),
  };
}

/**
 * listGithubProjectItems - Lists items in a GitHub Project V2
 */
@Tool({
  id: 'github-projects-list-items',
  name: 'listGithubProjectItems',
  description:
    'Lists items (issues, pull requests, and draft issues) in a GitHub Project V2, including their field values. Use listGithubProjectFields first to understand the available fields.',
  category: 'Github: Projects',
  parameters: ListGithubProjectItemsToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'List GitHub Project Items',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class ListGithubProjectItemsTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: ListGithubProjectItemsToolParams): Promise<string> {
    const { project_id: projectId, per_page: perPage, after } = args;
    const client = this.getClient();

    const response = await client.graphql<ListProjectItemsResponse>(
      `query ListProjectItems(
        $projectId: ID!
        $perPage: Int!
        $after: String
      ) {
        node(id: $projectId) {
          ... on ProjectV2 {
            __typename
            items(first: $perPage, after: $after) {
              totalCount
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                id
                type
                isArchived
                content {
                  ... on Issue {
                    __typename
                    id
                    title
                    number
                    state
                    url
                    body
                    createdAt
                    updatedAt
                    closedAt
                    author { login }
                    assignees(first: 5) { nodes { login } }
                    labels(first: 10) { nodes { name } }
                  }
                  ... on PullRequest {
                    __typename
                    id
                    title
                    number
                    state
                    url
                    body
                    createdAt
                    updatedAt
                    closedAt
                    author { login }
                    assignees(first: 5) { nodes { login } }
                    labels(first: 10) { nodes { name } }
                  }
                  ... on DraftIssue {
                    __typename
                    id
                    title
                    body
                    createdAt
                    updatedAt
                    author: creator { login }
                  }
                }
                fieldValues(first: 50) {
                  nodes {
                    ... on ProjectV2ItemFieldTextValue {
                      __typename
                      text
                      field { ... on ProjectV2Field { name } }
                    }
                    ... on ProjectV2ItemFieldNumberValue {
                      __typename
                      number
                      field { ... on ProjectV2Field { name } }
                    }
                    ... on ProjectV2ItemFieldDateValue {
                      __typename
                      date
                      field { ... on ProjectV2Field { name } }
                    }
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      __typename
                      name
                      field { ... on ProjectV2SingleSelectField { name } }
                    }
                    ... on ProjectV2ItemFieldIterationValue {
                      __typename
                      title
                      startDate
                      field { ... on ProjectV2IterationField { name } }
                    }
                    ... on ProjectV2ItemFieldLabelValue {
                      __typename
                      labels(first: 10) { nodes { name } }
                      field { ... on ProjectV2Field { name } }
                    }
                    ... on ProjectV2ItemFieldMilestoneValue {
                      __typename
                      milestone { title }
                      field { ... on ProjectV2Field { name } }
                    }
                    ... on ProjectV2ItemFieldUserValue {
                      __typename
                      users(first: 10) { nodes { login } }
                      field { ... on ProjectV2Field { name } }
                    }
                    ... on ProjectV2ItemFieldPullRequestValue {
                      __typename
                      pullRequests(first: 5) { nodes { title number url } }
                      field { ... on ProjectV2Field { name } }
                    }
                    ... on ProjectV2ItemFieldRepositoryValue {
                      __typename
                      repository { nameWithOwner url }
                      field { ... on ProjectV2Field { name } }
                    }
                    ... on ProjectV2ItemFieldReviewerValue {
                      __typename
                      reviewers(first: 10) {
                        nodes {
                          ... on User { login }
                          ... on Team { name slug }
                        }
                      }
                      field { ... on ProjectV2Field { name } }
                    }
                  }
                }
              }
            }
          }
        }
      }`,
      { projectId, perPage, after },
    );

    if (!response.node || !('items' in response.node)) {
      throw new Error(`Project with ID '${projectId}' not found or inaccessible`);
    }

    const { items } = response.node;

    return JSON.stringify({
      success: true,
      totalCount: items.totalCount,
      pageInfo: items.pageInfo,
      items: items.nodes.map(mapItem),
    });
  }
}
