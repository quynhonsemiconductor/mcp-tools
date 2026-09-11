import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the deleteGithubProjectField tool parameters
 */
export const DeleteGithubProjectFieldToolSchema = z.object({
  project_id: z.string().describe('The node ID of the project (e.g., PVT_kwDOABC123)'),
  field_id: z
    .string()
    .describe(
      'The node ID of the field to delete (e.g., PVTF_kwDOABC123). Use listGithubProjectFields to find field IDs.',
    ),
});

/**
 * Type for the deleteGithubProjectField tool parameters
 */
export type DeleteGithubProjectFieldToolParams = z.infer<typeof DeleteGithubProjectFieldToolSchema>;

/**
 * Interface for the GraphQL mutation response
 */
interface DeleteFieldResponse {
  deleteProjectV2Field: {
    projectV2Field: {
      id: string;
    };
  } | null;
}

/**
 * deleteGithubProjectField - Deletes a custom field from a GitHub Project V2
 */
@Tool({
  id: 'github-projects-delete-field',
  name: 'deleteGithubProjectField',
  description:
    'Deletes a custom field from a GitHub Project V2. This permanently removes the field and all its values from all items in the project.',
  category: 'Github: Projects',
  parameters: DeleteGithubProjectFieldToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Delete GitHub Project Field',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class DeleteGithubProjectFieldTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: DeleteGithubProjectFieldToolParams): Promise<string> {
    // Note: project_id is accepted in the schema for interface consistency
    // but is not passed to the mutation — deleteProjectV2Field only requires fieldId.
    const { field_id: fieldId } = args;
    const client = this.getClient();

    const response = await client.graphql<DeleteFieldResponse>(
      `mutation DeleteField($fieldId: ID!) {
        deleteProjectV2Field(input: { fieldId: $fieldId }) {
          projectV2Field {
            # ProjectV2FieldConfiguration is a union, so id cannot be selected on it
            # directly — GraphQL rejected the whole mutation.
            ... on ProjectV2Field {
              id
            }
            ... on ProjectV2SingleSelectField {
              id
            }
            ... on ProjectV2IterationField {
              id
            }
          }
        }
      }`,
      { fieldId },
    );

    if (!response.deleteProjectV2Field?.projectV2Field) {
      throw new Error('Failed to delete field: unexpected API response');
    }

    return JSON.stringify({
      success: true,
      deletedFieldId: response.deleteProjectV2Field.projectV2Field.id,
    });
  }
}
