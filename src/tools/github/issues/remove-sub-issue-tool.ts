import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Remove Github Sub-Issue tool parameters
 */
export const GithubIssuesRemoveSubIssueSchema = createGithubBaseSchema({
  issue_number: z.number().int().min(1).describe('The issue number of the parent issue'),
  sub_issue_id: z
    .number()
    .int()
    .min(1)
    .describe('The ID (not number) of the sub-issue to remove from the parent'),
});

/**
 * Type for the Remove Github Sub-Issue tool parameters
 */
export type GithubIssuesRemoveSubIssueToolParams = z.infer<typeof GithubIssuesRemoveSubIssueSchema>;

/**
 * Remove Github Sub-Issue - Removes a sub-issue from a parent issue
 */
@Tool({
  id: 'github-issues-remove-sub-issue',
  name: 'removeGithubSubIssue',
  description:
    'Removes a sub-issue from a parent issue, dissolving the parent-child relationship without deleting either issue',
  category: 'Github: Issues',
  parameters: GithubIssuesRemoveSubIssueSchema,
  envVars: ['GITHUB_TOKEN'],
  includeByDefault: true,
  version: '1.0.0',
  annotations: {
    title: 'Remove Github Sub-Issue',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubIssuesRemoveSubIssueTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubIssuesRemoveSubIssueToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubIssuesRemoveSubIssueSchema, args);

    const response = await this.getClient().request(
      'DELETE /repos/{owner}/{repo}/issues/{issue_number}/sub_issue',
      apiParams,
    );

    // The generated Octokit types for this endpoint only model a 200 response,
    // but GitHub's actual API (and older API versions) can return 204 No
    // Content for this DELETE. Compare against `number` so both are handled.
    if ((response.status as number) === 204 || !response.data) {
      return JSON.stringify({
        success: true,
        message: `Sub-issue ${apiParams.sub_issue_id} has been removed from issue #${apiParams.issue_number}`,
      });
    }

    return this.cleanResponse(response);
  }
}
