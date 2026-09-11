import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { UserError } from '../../../utils';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Add Github Sub-Issue tool parameters
 */
export const GithubIssuesAddSubIssueSchema = createGithubBaseSchema({
  issue_number: z.number().int().min(1).describe('The issue number of the parent issue'),
  sub_issue_id: z
    .number()
    .int()
    .min(1)
    .describe('The ID (not number) of the issue to add as a sub-issue'),
  replace_parent: z
    .boolean()
    .optional()
    .describe(
      "When true, replaces the sub-issue's existing parent if it already has one. Defaults to false",
    ),
});

/**
 * Type for the Add Github Sub-Issue tool parameters
 */
export type GithubIssuesAddSubIssueToolParams = z.infer<typeof GithubIssuesAddSubIssueSchema>;

/**
 * Add Github Sub-Issue - Adds an existing issue as a sub-issue of a parent issue
 */
@Tool({
  id: 'github-issues-add-sub-issue',
  name: 'addGithubSubIssue',
  description:
    'Adds an existing issue as a sub-issue of a parent issue, creating a formal parent-child relationship visible in the Sub-issues section of the parent',
  category: 'Github: Issues',
  parameters: GithubIssuesAddSubIssueSchema,
  envVars: ['GITHUB_TOKEN'],
  includeByDefault: true,
  version: '1.0.0',
  annotations: {
    title: 'Add Github Sub-Issue',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubIssuesAddSubIssueTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubIssuesAddSubIssueToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubIssuesAddSubIssueSchema, args);

    try {
      return this.cleanResponse(
        await this.getClient().request(
          'POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues',
          apiParams,
        ),
      );
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        (error as { status?: unknown }).status === 422 &&
        'message' in error &&
        typeof (error as { message?: unknown }).message === 'string' &&
        (error as { message: string }).message.includes('already has a parent')
      ) {
        throw new UserError(
          'Sub-issue already has a parent. Pass replace_parent: true to reassign it to this parent.',
        );
      }
      throw error;
    }
  }
}
