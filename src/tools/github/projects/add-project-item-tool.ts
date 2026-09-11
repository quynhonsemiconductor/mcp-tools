import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the addGithubProjectItem tool parameters
 */
export const AddGithubProjectItemToolSchema = z.object({
  project_id: z.string().describe('The node ID of the project (e.g., PVT_kwDOABC123)'),
  content_id: z.string().describe('The node ID of the issue or pull request to add to the project'),
});

/**
 * Type for the addGithubProjectItem tool parameters
 */
export type AddGithubProjectItemToolParams = z.infer<typeof AddGithubProjectItemToolSchema>;

/**
 * Interface for the GraphQL mutation response
 */
interface AddProjectItemResponse {
  addProjectV2ItemById: {
    item: {
      id: string;
      type: string;
      content: {
        __typename: string;
        title: string;
        number: number;
      } | null;
    };
  };
}

/**
 * addGithubProjectItem - Adds an existing issue or pull request to a GitHub Project V2
 */
@Tool({
  id: 'github-projects-add-item',
  name: 'addGithubProjectItem',
  description:
    'Adds an existing issue or pull request to a GitHub Project V2. Requires the project node ID and the content node ID (issue or PR).',
  category: 'Github: Projects',
  parameters: AddGithubProjectItemToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Add GitHub Project Item',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class AddGithubProjectItemTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: AddGithubProjectItemToolParams): Promise<string> {
    const { project_id: projectId, content_id: contentId } = args;
    const client = this.getClient();

    const response = await client.graphql<AddProjectItemResponse>(
      `mutation AddProjectItem($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
          item {
            id
            type
            content {
              ... on Issue {
                __typename
                title
                number
              }
              ... on PullRequest {
                __typename
                title
                number
              }
            }
          }
        }
      }`,
      { projectId, contentId },
    );

    if (!response.addProjectV2ItemById?.item) {
      throw new Error('Failed to add item to project: unexpected API response');
    }

    const { item } = response.addProjectV2ItemById;

    return JSON.stringify({
      success: true,
      item: {
        id: item.id,
        type: item.type,
        content: item.content
          ? {
              type: item.content.__typename,
              title: item.content.title,
              number: item.content.number,
            }
          : null,
      },
    });
  }
}
