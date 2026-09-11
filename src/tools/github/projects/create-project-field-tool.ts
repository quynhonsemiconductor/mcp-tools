import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the createGithubProjectField tool parameters
 */
export const CreateGithubProjectFieldToolSchema = z.object({
  project_id: z.string().describe('The node ID of the project (e.g., PVT_kwDOABC123)'),
  name: z.string().describe('Name for the new field'),
  data_type: z
    .enum(['TEXT', 'NUMBER', 'DATE', 'SINGLE_SELECT', 'ITERATION'])
    .describe('The data type for the field'),
  single_select_options: z
    .array(
      z.object({
        name: z.string().describe('Option name'),
        // GitHub's ProjectV2SingleSelectFieldOptionInput rejects a null colour or
        // description — "Expected value to not be null" — so leaving these merely
        // optional made every SINGLE_SELECT field fail. They default instead.
        description: z.string().default('').describe('Option description'),
        color: z
          .enum(['GRAY', 'BLUE', 'GREEN', 'YELLOW', 'ORANGE', 'RED', 'PINK', 'PURPLE'])
          .default('GRAY')
          .describe('Option colour'),
      }),
    )
    .optional()
    .describe('Options for SINGLE_SELECT fields. Required when data_type is SINGLE_SELECT.'),
});

/**
 * Type for the createGithubProjectField tool parameters
 */
// z.input, not z.infer: description and color have defaults, so a caller may omit
// them even though the parsed value always has them.
export type CreateGithubProjectFieldToolParams = z.input<typeof CreateGithubProjectFieldToolSchema>;

/**
 * Interface for the GraphQL mutation response
 */
interface CreateFieldResponse {
  createProjectV2Field: {
    projectV2Field: {
      __typename: string;
      id: string;
      name: string;
      dataType: string;
    };
  } | null;
}

/**
 * createGithubProjectField - Creates a custom field in a GitHub Project V2
 */
@Tool({
  id: 'github-projects-create-field',
  name: 'createGithubProjectField',
  description:
    'Creates a new custom field in a GitHub Project V2. Supports TEXT, NUMBER, DATE, SINGLE_SELECT, and ITERATION field types. For SINGLE_SELECT, provide single_select_options with name and optional color/description.',
  category: 'Github: Projects',
  parameters: CreateGithubProjectFieldToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Create GitHub Project Field',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class CreateGithubProjectFieldTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: CreateGithubProjectFieldToolParams): Promise<string> {
    const {
      project_id: projectId,
      name,
      data_type: dataType,
      single_select_options: singleSelectOptions,
    } = args;
    const client = this.getClient();

    const response = await client.graphql<CreateFieldResponse>(
      `mutation CreateField(
        $projectId: ID!
        $name: String!
        $dataType: ProjectV2CustomFieldType!
        $singleSelectOptions: [ProjectV2SingleSelectFieldOptionInput!]
      ) {
        createProjectV2Field(input: {
          projectId: $projectId
          name: $name
          dataType: $dataType
          singleSelectOptions: $singleSelectOptions
        }) {
          projectV2Field {
            # projectV2Field is the union ProjectV2FieldConfiguration, and GraphQL
            # rejects selecting fields directly on a union — every call failed with
            # "Selections can't be made directly on unions". The concrete types have
            # to be named, one per field kind this tool can create.
            __typename
            ... on ProjectV2Field {
              id
              name
              dataType
            }
            ... on ProjectV2SingleSelectField {
              id
              name
              dataType
            }
            ... on ProjectV2IterationField {
              id
              name
              dataType
            }
          }
        }
      }`,
      { projectId, name, dataType, singleSelectOptions },
    );

    if (!response.createProjectV2Field?.projectV2Field) {
      throw new Error('Failed to create field: unexpected API response');
    }

    const { projectV2Field } = response.createProjectV2Field;

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
