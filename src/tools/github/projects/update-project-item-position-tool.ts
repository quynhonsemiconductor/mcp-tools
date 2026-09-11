import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the updateGithubProjectItemPosition tool parameters
 */
export const UpdateGithubProjectItemPositionToolSchema = z.object({
  project_id: z.string().describe('The node ID of the project (e.g., PVT_kwDOABC123)'),
  item_id: z.string().describe('The node ID of the item to reposition (e.g., PVTI_kwDOABC123)'),
  after_id: z
    .string()
    .optional()
    .describe(
      'The node ID of the item to position after. Omit to move the item to the top of the list.',
    ),
});

/**
 * Type for the updateGithubProjectItemPosition tool parameters
 */
export type UpdateGithubProjectItemPositionToolParams = z.infer<
  typeof UpdateGithubProjectItemPositionToolSchema
>;

/**
 * Interface for the GraphQL mutation response
 */
interface UpdateItemPositionResponse {
  updateProjectV2ItemPosition: {
    items: {
      nodes: Array<{ id: string }>;
    };
  } | null;
}

/**
 * updateGithubProjectItemPosition - Reorders an item's position in a GitHub Project V2
 */
@Tool({
  id: 'github-projects-update-item-position',
  name: 'updateGithubProjectItemPosition',
  description:
    'Updates the position of an item in a GitHub Project V2. Place the item after a specific item, or omit after_id to move it to the top.',
  category: 'Github: Projects',
  parameters: UpdateGithubProjectItemPositionToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Update GitHub Project Item Position',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class UpdateGithubProjectItemPositionTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: UpdateGithubProjectItemPositionToolParams): Promise<string> {
    const { project_id: projectId, item_id: itemId, after_id: afterId } = args;
    const client = this.getClient();

    const response = await client.graphql<UpdateItemPositionResponse>(
      `mutation UpdateItemPosition($projectId: ID!, $itemId: ID!, $afterId: ID) {
        updateProjectV2ItemPosition(input: {
          projectId: $projectId
          itemId: $itemId
          afterId: $afterId
        }) {
          items(first: 1) {
            nodes {
              id
            }
          }
        }
      }`,
      { projectId, itemId, afterId },
    );

    if (!response.updateProjectV2ItemPosition?.items) {
      throw new Error('Failed to update item position: unexpected API response');
    }

    return JSON.stringify({
      success: true,
      itemId,
    });
  }
}
