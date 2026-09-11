import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema for field value - discriminated by the key present.
 * Use listGithubProjectFields to discover field IDs and option IDs.
 */
const FieldValueSchema = z.union([
  z.object({ text: z.string().describe('Text value for TEXT fields') }),
  z.object({ number: z.number().describe('Numeric value for NUMBER fields') }),
  z.object({
    date: z.string().describe('ISO 8601 date string for DATE fields (e.g., 2024-01-15)'),
  }),
  z.object({
    singleSelectOptionId: z
      .string()
      .describe(
        'Option ID for SINGLE_SELECT fields (use listGithubProjectFields to find option IDs)',
      ),
  }),
  z.object({
    iterationId: z
      .string()
      .describe(
        'Iteration ID for ITERATION fields (use listGithubProjectFields to find iteration IDs)',
      ),
  }),
]);

/**
 * Schema definition for the updateGithubProjectItemField tool parameters
 */
export const UpdateGithubProjectItemFieldToolSchema = z.object({
  project_id: z.string().describe('The node ID of the project (e.g., PVT_kwDOABC123)'),
  item_id: z.string().describe('The node ID of the project item to update (e.g., PVTI_kwDOABC123)'),
  field_id: z
    .string()
    .describe(
      'The node ID of the field to update (e.g., PVTF_kwDOABC123). Use listGithubProjectFields to find field IDs.',
    ),
  value: FieldValueSchema.describe(
    'The value to set. Must match the field type: { text: "..." } for TEXT, { number: 42 } for NUMBER, { date: "2024-01-15" } for DATE, { singleSelectOptionId: "..." } for SINGLE_SELECT, { iterationId: "..." } for ITERATION.',
  ),
});

/**
 * Type for the updateGithubProjectItemField tool parameters
 */
export type UpdateGithubProjectItemFieldToolParams = z.infer<
  typeof UpdateGithubProjectItemFieldToolSchema
>;

/**
 * Interface for the GraphQL mutation response
 */
interface UpdateFieldValueResponse {
  updateProjectV2ItemFieldValue: {
    projectV2Item: {
      id: string;
    };
  };
}

/**
 * updateGithubProjectItemField - Sets a field value on a project item
 */
@Tool({
  id: 'github-projects-update-item-field',
  name: 'updateGithubProjectItemField',
  description:
    'Sets a field value on a GitHub Project V2 item. Supports text, number, date, single-select, and iteration field types. Use listGithubProjectFields first to discover field IDs and available options.',
  category: 'Github: Projects',
  parameters: UpdateGithubProjectItemFieldToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Update GitHub Project Item Field',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class UpdateGithubProjectItemFieldTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: UpdateGithubProjectItemFieldToolParams): Promise<string> {
    const { project_id: projectId, item_id: itemId, field_id: fieldId, value } = args;
    const client = this.getClient();

    const response = await client.graphql<UpdateFieldValueResponse>(
      `mutation UpdateItemFieldValue(
        $projectId: ID!
        $itemId: ID!
        $fieldId: ID!
        $value: ProjectV2FieldValue!
      ) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: $value
        }) {
          projectV2Item {
            id
          }
        }
      }`,
      { projectId, itemId, fieldId, value },
    );

    if (!response.updateProjectV2ItemFieldValue?.projectV2Item) {
      throw new Error('Failed to update field value: unexpected API response');
    }

    return JSON.stringify({
      success: true,
      itemId: response.updateProjectV2ItemFieldValue.projectV2Item.id,
    });
  }
}
