import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the listGithubProjectFields tool parameters
 */
export const ListGithubProjectFieldsToolSchema = z.object({
  project_id: z.string().describe('The node ID of the project (e.g., PVT_kwDOABC123)'),
  per_page: z.number().int().min(1).max(100).default(50).describe('Number of fields to return'),
  after: z.string().optional().describe('Cursor for pagination to fetch the next page of fields'),
});

/**
 * Type for the listGithubProjectFields tool parameters
 */
export type ListGithubProjectFieldsToolParams = z.infer<typeof ListGithubProjectFieldsToolSchema>;

/**
 * Interface for field nodes in the GraphQL response
 */
interface ProjectV2FieldNode {
  __typename: string;
  id: string;
  name: string;
  dataType?: string;
  options?: Array<{ id: string; name: string }>;
  configuration?: {
    iterations: Array<{
      id: string;
      title: string;
      startDate: string;
      duration: number;
    }>;
  };
}

/**
 * Interface for the GraphQL response
 */
interface ListProjectFieldsResponse {
  node: {
    __typename: string;
    fields: {
      totalCount: number;
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      nodes: ProjectV2FieldNode[];
    };
  } | null;
}

/**
 * Maps a field node into a clean response shape
 */
function mapField(field: ProjectV2FieldNode) {
  const result: Record<string, unknown> = {
    id: field.id,
    name: field.name,
    type: field.__typename,
    dataType: field.dataType ?? null,
  };

  if (field.options) {
    result.options = field.options;
  }

  if (field.configuration?.iterations) {
    result.iterations = field.configuration.iterations;
  }

  return result;
}

/**
 * listGithubProjectFields - Lists fields/columns defined on a GitHub Project V2
 */
@Tool({
  id: 'github-projects-list-fields',
  name: 'listGithubProjectFields',
  description:
    'Lists fields/columns defined on a GitHub Project V2. Returns field IDs, names, types, and options (for single-select and iteration fields). Use this to discover field IDs before updating item field values.',
  category: 'Github: Projects',
  parameters: ListGithubProjectFieldsToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'List GitHub Project Fields',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class ListGithubProjectFieldsTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: ListGithubProjectFieldsToolParams): Promise<string> {
    const { project_id: projectId, per_page: perPage, after } = args;
    const client = this.getClient();

    const response = await client.graphql<ListProjectFieldsResponse>(
      `query ListProjectFields(
        $projectId: ID!
        $perPage: Int!
        $after: String
      ) {
        node(id: $projectId) {
          ... on ProjectV2 {
            __typename
            fields(first: $perPage, after: $after) {
              totalCount
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                ... on ProjectV2Field {
                  __typename
                  id
                  name
                  dataType
                }
                ... on ProjectV2SingleSelectField {
                  __typename
                  id
                  name
                  dataType
                  options {
                    id
                    name
                  }
                }
                ... on ProjectV2IterationField {
                  __typename
                  id
                  name
                  dataType
                  configuration {
                    iterations {
                      id
                      title
                      startDate
                      duration
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

    if (!response.node || !('fields' in response.node)) {
      throw new Error(`Project with ID '${projectId}' not found or inaccessible`);
    }

    const { fields } = response.node;

    return JSON.stringify({
      success: true,
      totalCount: fields.totalCount,
      pageInfo: fields.pageInfo,
      fields: fields.nodes.map(mapField),
    });
  }
}
