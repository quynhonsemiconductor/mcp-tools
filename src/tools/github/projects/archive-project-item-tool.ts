import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the archiveGithubProjectItem tool parameters
 */
export const ArchiveGithubProjectItemToolSchema = z.object({
  project_id: z.string().describe('The node ID of the project (e.g., PVT_kwDOABC123)'),
  item_id: z.string().describe('The node ID of the item to archive (e.g., PVTI_kwDOABC123)'),
});

/**
 * Type for the archiveGithubProjectItem tool parameters
 */
export type ArchiveGithubProjectItemToolParams = z.infer<typeof ArchiveGithubProjectItemToolSchema>;

/**
 * Interface for the GraphQL mutation response
 */
interface ArchiveProjectItemResponse {
  archiveProjectV2Item: {
    item: {
      id: string;
      isArchived: boolean;
    };
  } | null;
}

/**
 * archiveGithubProjectItem - Archives an item in a GitHub Project V2
 */
@Tool({
  id: 'github-projects-archive-item',
  name: 'archiveGithubProjectItem',
  description:
    'Archives an item in a GitHub Project V2. Archived items are hidden from default views but can be restored with unarchiveGithubProjectItem.',
  category: 'Github: Projects',
  parameters: ArchiveGithubProjectItemToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Archive GitHub Project Item',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class ArchiveGithubProjectItemTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: ArchiveGithubProjectItemToolParams): Promise<string> {
    const { project_id: projectId, item_id: itemId } = args;
    const client = this.getClient();

    const response = await client.graphql<ArchiveProjectItemResponse>(
      `mutation ArchiveProjectItem($projectId: ID!, $itemId: ID!) {
        archiveProjectV2Item(input: { projectId: $projectId, itemId: $itemId }) {
          item {
            id
            isArchived
          }
        }
      }`,
      { projectId, itemId },
    );

    if (!response.archiveProjectV2Item?.item) {
      throw new Error('Failed to archive project item: unexpected API response');
    }

    return JSON.stringify({
      success: true,
      item: response.archiveProjectV2Item.item,
    });
  }
}
