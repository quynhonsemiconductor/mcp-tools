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
        description: z.string().optional().describe('Option description'),
        color: z.string().optional().describe('Option color (e.g., RED, BLUE, GREEN)'),
      }),
    )
    .optional()
    .describe('Options for SINGLE_SELECT fields. Required when data_type is SINGLE_SELECT.'),
});

/**
 * Type for the createGithubProjectField tool parameters
 */
export type CreateGithubProjectFieldToolParams = z.infer<typeof CreateGithubProjectFieldToolSchema>;

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
            __typename
            id
            name
            dataType
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
