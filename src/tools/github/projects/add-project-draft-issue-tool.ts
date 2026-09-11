import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the addGithubProjectDraftIssue tool parameters
 */
export const AddGithubProjectDraftIssueToolSchema = z.object({
  project_id: z.string().describe('The node ID of the project (e.g., PVT_kwDOABC123)'),
  title: z.string().describe('Title of the draft issue'),
  body: z.string().optional().describe('Body content of the draft issue'),
});

/**
 * Type for the addGithubProjectDraftIssue tool parameters
 */
export type AddGithubProjectDraftIssueToolParams = z.infer<
  typeof AddGithubProjectDraftIssueToolSchema
>;

/**
 * Interface for the GraphQL mutation response
 */
interface AddDraftIssueResponse {
  addProjectV2DraftIssue: {
    projectItem: {
      id: string;
      type: string;
      content: {
        __typename: string;
        title: string;
        body: string | null;
      } | null;
    };
  };
}

/**
 * addGithubProjectDraftIssue - Creates a draft issue in a GitHub Project V2
 */
@Tool({
  id: 'github-projects-add-draft-issue',
  name: 'addGithubProjectDraftIssue',
  description:
    'Creates a draft issue directly in a GitHub Project V2. Draft issues exist only within the project and are not linked to a repository.',
  category: 'Github: Projects',
  parameters: AddGithubProjectDraftIssueToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Add GitHub Project Draft Issue',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class AddGithubProjectDraftIssueTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: AddGithubProjectDraftIssueToolParams): Promise<string> {
    const { project_id: projectId, title, body } = args;
    const client = this.getClient();

    const response = await client.graphql<AddDraftIssueResponse>(
      `mutation AddDraftIssue($projectId: ID!, $title: String!, $body: String) {
        addProjectV2DraftIssue(input: { projectId: $projectId, title: $title, body: $body }) {
          projectItem {
            id
            type
            content {
              ... on DraftIssue {
                __typename
                title
                body
              }
            }
          }
        }
      }`,
      { projectId, title, body },
    );

    if (!response.addProjectV2DraftIssue?.projectItem) {
      throw new Error('Failed to create draft issue: unexpected API response');
    }

    const { projectItem } = response.addProjectV2DraftIssue;

    return JSON.stringify({
      success: true,
      item: {
        id: projectItem.id,
        type: projectItem.type,
        content: projectItem.content
          ? {
              type: projectItem.content.__typename,
              title: projectItem.content.title,
              body: projectItem.content.body,
            }
          : null,
      },
    });
  }
}
