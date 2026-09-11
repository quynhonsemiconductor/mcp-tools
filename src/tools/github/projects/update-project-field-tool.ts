import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the updateGithubProjectField tool parameters
 */
export const UpdateGithubProjectFieldToolSchema = z.object({
  field_id: z
    .string()
    .describe(
      'The node ID of the field to update (e.g., PVTF_kwDOABC123). Use listGithubProjectFields to find field IDs.',
    ),
  name: z.string().optional().describe('New name for the field'),
  single_select_options: z
    .array(
      z.object({
        id: z
          .string()
          .optional()
          .describe('Option ID to update an existing option. Omit to add a new option.'),
        name: z.string().describe('Option name'),
        description: z.string().optional().describe('Option description'),
        color: z.string().optional().describe('Option color (e.g., RED, BLUE, GREEN)'),
      }),
    )
    .optional()
    .describe(
      'Updated options for SINGLE_SELECT fields. Include id to update existing options, omit id to add new options.',
    ),
});

/**
 * Type for the updateGithubProjectField tool parameters
 */
export type UpdateGithubProjectFieldToolParams = z.infer<typeof UpdateGithubProjectFieldToolSchema>;

/**
 * Interface for the GraphQL mutation response
 */
interface UpdateFieldResponse {
  updateProjectV2Field: {
    projectV2Field: {
      __typename: string;
      id: string;
      name: string;
      dataType: string;
    };
  } | null;
}

/**
 * updateGithubProjectField - Updates a custom field in a GitHub Project V2
 */
@Tool({
  id: 'github-projects-update-field',
  name: 'updateGithubProjectField',
  description:
    'Updates a custom field in a GitHub Project V2. Can rename the field or modify single-select options. For single-select fields, include the option id to update existing options or omit it to add new options.',
  category: 'Github: Projects',
  parameters: UpdateGithubProjectFieldToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Update GitHub Project Field',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class UpdateGithubProjectFieldTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: UpdateGithubProjectFieldToolParams): Promise<string> {
    const { field_id: fieldId, name, single_select_options: singleSelectOptions } = args;
    const client = this.getClient();

    const response = await client.graphql<UpdateFieldResponse>(
      `mutation UpdateField(
        $fieldId: ID!
        $name: String
        $singleSelectOptions: [ProjectV2SingleSelectFieldOptionInput!]
      ) {
        updateProjectV2Field(input: {
          fieldId: $fieldId
          name: $name
          singleSelectOptions: $singleSelectOptions
        }) {
          projectV2Field {
            __typename
            id
            name
            dataType
          }
        }
      }`,
      { fieldId, name, singleSelectOptions },
    );

    if (!response.updateProjectV2Field?.projectV2Field) {
      throw new Error('Failed to update field: unexpected API response');
    }

    const { projectV2Field } = response.updateProjectV2Field;

    return JSON.stringify({
      success: true,
      field: {
        id: projectV2Field.id,
        name: projectV2Field.name,
        dataType: projectV2Field.dataType,
        type: projectV2Field.__typename,
      },
    });
  }
}
