import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the createGithubProject tool parameters
 */
export const CreateGithubProjectToolSchema = z.object({
  owner_id: z
    .string()
    .describe(
      'The node ID of the owner (organization or user) for the new project. Use getGithubOrganization or the GraphQL viewer query to find the node ID.',
    ),
  title: z.string().describe('Title for the new project'),
});

/**
 * Type for the createGithubProject tool parameters
 */
export type CreateGithubProjectToolParams = z.infer<typeof CreateGithubProjectToolSchema>;

/**
 * Interface for the GraphQL mutation response
 */
interface CreateProjectResponse {
  createProjectV2: {
    projectV2: {
      id: string;
      number: number;
      title: string;
      url: string;
      public: boolean;
      createdAt: string;
    };
  };
}

/**
 * createGithubProject - Creates a new GitHub Project V2
 */
@Tool({
  id: 'github-projects-create',
  name: 'createGithubProject',
  description:
    'Creates a new GitHub Project V2 for an organization or user. Requires the owner node ID (use getGithubOrganization for orgs, or the GraphQL viewer query for users).',
  category: 'Github: Projects',
  parameters: CreateGithubProjectToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Create GitHub Project',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class CreateGithubProjectTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: CreateGithubProjectToolParams): Promise<string> {
    const { owner_id: ownerId, title } = args;
    const client = this.getClient();

    const response = await client.graphql<CreateProjectResponse>(
      `mutation CreateProject($ownerId: ID!, $title: String!) {
        createProjectV2(input: { ownerId: $ownerId, title: $title }) {
          projectV2 {
            id
            number
            title
            url
            public
            createdAt
          }
        }
      }`,
      { ownerId, title },
    );

    if (!response.createProjectV2?.projectV2) {
      throw new Error('Failed to create project: unexpected API response');
    }

    const { projectV2 } = response.createProjectV2;

    return JSON.stringify({
      success: true,
      project: {
        id: projectV2.id,
        number: projectV2.number,
        title: projectV2.title,
        url: projectV2.url,
        public: projectV2.public,
        createdAt: projectV2.createdAt,
      },
    });
  }
}
