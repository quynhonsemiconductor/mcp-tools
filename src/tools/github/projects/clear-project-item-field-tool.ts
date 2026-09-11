import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the clearGithubProjectItemField tool parameters
 */
export const ClearGithubProjectItemFieldToolSchema = z.object({
  project_id: z.string().describe('The node ID of the project (e.g., PVT_kwDOABC123)'),
  item_id: z.string().describe('The node ID of the project item (e.g., PVTI_kwDOABC123)'),
  field_id: z
    .string()
    .describe(
      'The node ID of the field to clear (e.g., PVTF_kwDOABC123). Use listGithubProjectFields to find field IDs.',
    ),
});

/**
 * Type for the clearGithubProjectItemField tool parameters
 */
export type ClearGithubProjectItemFieldToolParams = z.infer<
  typeof ClearGithubProjectItemFieldToolSchema
>;

/**
 * Interface for the GraphQL mutation response
 */
interface ClearFieldValueResponse {
  clearProjectV2ItemFieldValue: {
    projectV2Item: {
      id: string;
    };
  } | null;
}

/**
 * clearGithubProjectItemField - Clears a field value on a GitHub Project V2 item
 */
@Tool({
  id: 'github-projects-clear-item-field',
  name: 'clearGithubProjectItemField',
  description:
    'Clears/resets a field value on a GitHub Project V2 item. Supports text, number, date, single-select, iteration, assignees, labels, and milestone fields.',
  category: 'Github: Projects',
  parameters: ClearGithubProjectItemFieldToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Clear GitHub Project Item Field',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class ClearGithubProjectItemFieldTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: ClearGithubProjectItemFieldToolParams): Promise<string> {
    const { project_id: projectId, item_id: itemId, field_id: fieldId } = args;
    const client = this.getClient();

    const response = await client.graphql<ClearFieldValueResponse>(
      `mutation ClearFieldValue($projectId: ID!, $itemId: ID!, $fieldId: ID!) {
        clearProjectV2ItemFieldValue(input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
        }) {
          projectV2Item {
            id
          }
        }
      }`,
      { projectId, itemId, fieldId },
    );

    if (!response.clearProjectV2ItemFieldValue?.projectV2Item) {
      throw new Error('Failed to clear field value: unexpected API response');
    }

    return JSON.stringify({
      success: true,
      itemId: response.clearProjectV2ItemFieldValue.projectV2Item.id,
    });
  }
}
