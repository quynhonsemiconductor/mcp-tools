import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the deleteGithubProjectItem tool parameters
 */
export const DeleteGithubProjectItemToolSchema = z.object({
  project_id: z.string().describe('The node ID of the project (e.g., PVT_kwDOABC123)'),
  item_id: z
    .string()
    .describe('The node ID of the item to remove from the project (e.g., PVTI_kwDOABC123)'),
});

/**
 * Type for the deleteGithubProjectItem tool parameters
 */
export type DeleteGithubProjectItemToolParams = z.infer<typeof DeleteGithubProjectItemToolSchema>;

/**
 * Interface for the GraphQL mutation response
 */
interface DeleteProjectItemResponse {
  deleteProjectV2Item: {
    deletedItemId: string;
  };
}

/**
 * deleteGithubProjectItem - Removes an item from a GitHub Project V2
 */
@Tool({
  id: 'github-projects-delete-item',
  name: 'deleteGithubProjectItem',
  description:
    'Removes an item from a GitHub Project V2. This does not delete the underlying issue or pull request, only removes it from the project.',
  category: 'Github: Projects',
  parameters: DeleteGithubProjectItemToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Delete GitHub Project Item',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class DeleteGithubProjectItemTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: DeleteGithubProjectItemToolParams): Promise<string> {
    const { project_id: projectId, item_id: itemId } = args;
    const client = this.getClient();

    const response = await client.graphql<DeleteProjectItemResponse>(
      `mutation DeleteProjectItem($projectId: ID!, $itemId: ID!) {
        deleteProjectV2Item(input: { projectId: $projectId, itemId: $itemId }) {
          deletedItemId
        }
      }`,
      { projectId, itemId },
    );

    if (!response.deleteProjectV2Item?.deletedItemId) {
      throw new Error('Failed to delete project item: unexpected API response');
    }

    return JSON.stringify({
      success: true,
      deletedItemId: response.deleteProjectV2Item.deletedItemId,
    });
  }
}
