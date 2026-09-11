import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the updateGithubProjectDraftIssue tool parameters
 */
export const UpdateGithubProjectDraftIssueToolSchema = z.object({
  project_id: z.string().describe('The node ID of the project (e.g., PVT_kwDOABC123)'),
  item_id: z
    .string()
    .describe('The node ID of the draft issue item to update (e.g., PVTI_kwDOABC123)'),
  title: z.string().optional().describe('New title for the draft issue'),
  body: z.string().optional().describe('New body content for the draft issue'),
});

/**
 * Type for the updateGithubProjectDraftIssue tool parameters
 */
export type UpdateGithubProjectDraftIssueToolParams = z.infer<
  typeof UpdateGithubProjectDraftIssueToolSchema
>;

/**
 * Interface for the GraphQL mutation response
 */
/**
 * Interface for resolving a ProjectV2Item to its DraftIssue content ID
 */
interface ResolveDraftIssueIdResponse {
  node: {
    content: {
      id: string;
    } | null;
  } | null;
}

/**
 * Interface for the GraphQL mutation response
 */
interface UpdateDraftIssueResponse {
  updateProjectV2DraftIssue: {
    draftIssue: {
      id: string;
      title: string;
      body: string | null;
    };
  } | null;
}

/**
 * updateGithubProjectDraftIssue - Updates a draft issue in a GitHub Project V2
 */
@Tool({
  id: 'github-projects-update-draft-issue',
  name: 'updateGithubProjectDraftIssue',
  description: 'Updates the title and/or body of a draft issue in a GitHub Project V2.',
  category: 'Github: Projects',
  parameters: UpdateGithubProjectDraftIssueToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Update GitHub Project Draft Issue',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class UpdateGithubProjectDraftIssueTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: UpdateGithubProjectDraftIssueToolParams): Promise<string> {
    // Note: project_id is accepted in the schema for interface consistency
    // but is not passed to the mutation — updateProjectV2DraftIssue only requires draftIssueId.
    const { item_id: itemId, title, body } = args;
    const client = this.getClient();

    // Resolve the ProjectV2Item ID to the DraftIssue content node ID,
    // since the mutation requires the DraftIssue ID, not the item wrapper ID.
    const resolveResponse = await client.graphql<ResolveDraftIssueIdResponse>(
      `query ResolveDraftIssueId($itemId: ID!) {
          node(id: $itemId) {
            ... on ProjectV2Item {
              content {
                ... on DraftIssue {
                  id
                }
              }
            }
          }
        }`,
      { itemId },
    );

    const draftIssueId = resolveResponse.node?.content?.id;
    if (!draftIssueId) {
      throw new Error(`Item '${itemId}' is not a draft issue or was not found`);
    }

    const response = await client.graphql<UpdateDraftIssueResponse>(
      `mutation UpdateDraftIssue($draftIssueId: ID!, $title: String, $body: String) {
        updateProjectV2DraftIssue(input: {
          draftIssueId: $draftIssueId
          title: $title
          body: $body
        }) {
          draftIssue {
            id
            title
            body
          }
        }
      }`,
      { draftIssueId, title, body },
    );

    if (!response.updateProjectV2DraftIssue?.draftIssue) {
      throw new Error('Failed to update draft issue: unexpected API response');
    }

    const { draftIssue } = response.updateProjectV2DraftIssue;

    return JSON.stringify({
      success: true,
      draftIssue: {
        id: draftIssue.id,
        title: draftIssue.title,
        body: draftIssue.body,
      },
    });
  }
}
