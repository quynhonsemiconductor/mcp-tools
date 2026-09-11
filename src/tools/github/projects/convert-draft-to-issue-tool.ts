import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the convertGithubProjectDraftToIssue tool parameters
 */
export const ConvertGithubProjectDraftToIssueToolSchema = z.object({
  item_id: z
    .string()
    .describe('The node ID of the draft issue item to convert (e.g., PVTI_kwDOABC123)'),
  repository_id: z
    .string()
    .describe(
      'The node ID of the repository to create the issue in. Use getGithubRepository to find the node ID.',
    ),
});

/**
 * Type for the convertGithubProjectDraftToIssue tool parameters
 */
export type ConvertGithubProjectDraftToIssueToolParams = z.infer<
  typeof ConvertGithubProjectDraftToIssueToolSchema
>;

/**
 * Interface for the GraphQL mutation response
 */
interface ConvertDraftToIssueResponse {
  convertProjectV2DraftIssueItemToIssue: {
    item: {
      id: string;
      type: string;
      content: {
        __typename: string;
        title: string;
        number: number;
        url: string;
      } | null;
    };
  } | null;
}

/**
 * convertGithubProjectDraftToIssue - Converts a draft issue into a real GitHub issue
 */
@Tool({
  id: 'github-projects-convert-draft-to-issue',
  name: 'convertGithubProjectDraftToIssue',
  description:
    'Converts a draft issue in a GitHub Project V2 into a real GitHub issue in the specified repository. The item remains in the project but is now linked to the created issue.',
  category: 'Github: Projects',
  parameters: ConvertGithubProjectDraftToIssueToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Convert Draft to Issue',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class ConvertGithubProjectDraftToIssueTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: ConvertGithubProjectDraftToIssueToolParams): Promise<string> {
    const { item_id: itemId, repository_id: repositoryId } = args;
    const client = this.getClient();

    const response = await client.graphql<ConvertDraftToIssueResponse>(
      `mutation ConvertDraftToIssue($itemId: ID!, $repositoryId: ID!) {
        convertProjectV2DraftIssueItemToIssue(input: {
          itemId: $itemId
          repositoryId: $repositoryId
        }) {
          item {
            id
            type
            content {
              ... on Issue {
                __typename
                title
                number
                url
              }
            }
          }
        }
      }`,
      { itemId, repositoryId },
    );

    if (!response.convertProjectV2DraftIssueItemToIssue?.item) {
      throw new Error('Failed to convert draft to issue: unexpected API response');
    }

    const { item } = response.convertProjectV2DraftIssueItemToIssue;

    return JSON.stringify({
      success: true,
      item: {
        id: item.id,
        type: item.type,
        content: item.content
          ? {
              type: item.content.__typename,
              title: item.content.title,
              number: item.content.number,
              url: item.content.url,
            }
          : null,
      },
    });
  }
}
