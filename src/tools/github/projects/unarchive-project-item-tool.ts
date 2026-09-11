import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the unarchiveGithubProjectItem tool parameters
 */
export const UnarchiveGithubProjectItemToolSchema = z.object({
  project_id: z.string().describe('The node ID of the project (e.g., PVT_kwDOABC123)'),
  item_id: z.string().describe('The node ID of the item to unarchive (e.g., PVTI_kwDOABC123)'),
});

/**
 * Type for the unarchiveGithubProjectItem tool parameters
 */
export type UnarchiveGithubProjectItemToolParams = z.infer<
  typeof UnarchiveGithubProjectItemToolSchema
>;

/**
 * Interface for the GraphQL mutation response
 */
interface UnarchiveProjectItemResponse {
  unarchiveProjectV2Item: {
    item: {
      id: string;
      isArchived: boolean;
    };
  } | null;
}

/**
 * unarchiveGithubProjectItem - Restores an archived item in a GitHub Project V2
 */
@Tool({
  id: 'github-projects-unarchive-item',
  name: 'unarchiveGithubProjectItem',
  description:
    'Restores an archived item in a GitHub Project V2, making it visible in default views again.',
  category: 'Github: Projects',
  parameters: UnarchiveGithubProjectItemToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Unarchive GitHub Project Item',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class UnarchiveGithubProjectItemTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: UnarchiveGithubProjectItemToolParams): Promise<string> {
    const { project_id: projectId, item_id: itemId } = args;
    const client = this.getClient();

    const response = await client.graphql<UnarchiveProjectItemResponse>(
      `mutation UnarchiveProjectItem($projectId: ID!, $itemId: ID!) {
        unarchiveProjectV2Item(input: { projectId: $projectId, itemId: $itemId }) {
          item {
            id
            isArchived
          }
        }
      }`,
      { projectId, itemId },
    );

    if (!response.unarchiveProjectV2Item?.item) {
      throw new Error('Failed to unarchive project item: unexpected API response');
    }

    return JSON.stringify({
      success: true,
      item: response.unarchiveProjectV2Item.item,
    });
  }
}
