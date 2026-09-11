import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the updateGithubProject tool parameters
 */
export const UpdateGithubProjectToolSchema = z.object({
  project_id: z.string().describe('The node ID of the project to update (e.g., PVT_kwDOABC123)'),
  title: z.string().optional().describe('New title for the project'),
  short_description: z.string().optional().describe('New short description for the project'),
  readme: z.string().optional().describe('New readme content for the project'),
  public: z.boolean().optional().describe('Whether the project should be publicly visible'),
  closed: z.boolean().optional().describe('Whether the project should be closed'),
});

/**
 * Type for the updateGithubProject tool parameters
 */
export type UpdateGithubProjectToolParams = z.infer<typeof UpdateGithubProjectToolSchema>;

/**
 * Interface for the GraphQL mutation response
 */
interface UpdateProjectResponse {
  updateProjectV2: {
    projectV2: {
      id: string;
      number: number;
      title: string;
      shortDescription: string | null;
      url: string;
      public: boolean;
      closed: boolean;
      readme: string | null;
      updatedAt: string;
    };
  };
}

/**
 * updateGithubProject - Updates a GitHub Project V2's settings
 */
@Tool({
  id: 'github-projects-update',
  name: 'updateGithubProject',
  description:
    'Updates a GitHub Project V2 settings including title, description, readme, visibility, and closed state.',
  category: 'Github: Projects',
  parameters: UpdateGithubProjectToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Update GitHub Project',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class UpdateGithubProjectTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: UpdateGithubProjectToolParams): Promise<string> {
    const {
      project_id: projectId,
      title,
      short_description: shortDescription,
      readme,
      public: isPublic,
      closed,
    } = args;
    const client = this.getClient();

    const response = await client.graphql<UpdateProjectResponse>(
      `mutation UpdateProject(
        $projectId: ID!
        $title: String
        $shortDescription: String
        $readme: String
        $public: Boolean
        $closed: Boolean
      ) {
        updateProjectV2(input: {
          projectId: $projectId
          title: $title
          shortDescription: $shortDescription
          readme: $readme
          public: $public
          closed: $closed
        }) {
          projectV2 {
            id
            number
            title
            shortDescription
            url
            public
            closed
            readme
            updatedAt
          }
        }
      }`,
      { projectId, title, shortDescription, readme, public: isPublic, closed },
    );

    if (!response.updateProjectV2?.projectV2) {
      throw new Error('Failed to update project: unexpected API response');
    }

    const { projectV2 } = response.updateProjectV2;

    return JSON.stringify({
      success: true,
      project: {
        id: projectV2.id,
        number: projectV2.number,
        title: projectV2.title,
        shortDescription: projectV2.shortDescription,
        url: projectV2.url,
        public: projectV2.public,
        closed: projectV2.closed,
        readme: projectV2.readme,
        updatedAt: projectV2.updatedAt,
      },
    });
  }
}
