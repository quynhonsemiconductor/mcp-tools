import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the List Github Sub-Issues tool parameters
 */
export const GithubIssuesListSubIssuesSchema = createGithubBaseSchema({
  issue_number: z.number().int().min(1).describe('The issue number of the parent issue'),
  per_page: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(30)
    .describe('Results per page (max 100)'),
  page: z.number().int().min(1).optional().describe('Page number'),
});

/**
 * Type for the List Github Sub-Issues tool parameters
 */
export type GithubIssuesListSubIssuesToolParams = z.input<typeof GithubIssuesListSubIssuesSchema>;

/**
 * List Github Sub-Issues - Lists all sub-issues of a parent issue
 */
@Tool({
  id: 'github-issues-list-sub-issues',
  name: 'listGithubSubIssues',
  description:
    'Lists all sub-issues of a parent issue, showing the formal parent-child relationships established via addGithubSubIssue',
  category: 'Github: Issues',
  parameters: GithubIssuesListSubIssuesSchema,
  envVars: ['GITHUB_TOKEN'],
  includeByDefault: true,
  version: '1.0.0',
  annotations: {
    title: 'List Github Sub-Issues',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubIssuesListSubIssuesTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubIssuesListSubIssuesToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubIssuesListSubIssuesSchema, args);

    return this.cleanResponse(
      await this.getClient().request(
        'GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues',
        apiParams,
      ),
      true,
    );
  }
}
