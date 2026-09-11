import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Get Github Issue Comments tool parameters
 */
export const GithubIssuesGetCommentsSchema = createGithubBaseSchema({
  issue_number: z.number().int().min(1).describe('The issue number'),
});

/**
 * Type for the Get Github Issue Comments tool parameters
 */
export type GithubIssuesGetCommentsToolParams = z.infer<typeof GithubIssuesGetCommentsSchema>;

/**
 * Get Github Issue Comments - Gets the comments of an issue within a repository
 */
@Tool({
  id: 'github-issues-get-comments',
  name: 'getGithubIssueComments',
  description: 'Gets the comments of an issue within a repository',
  category: 'Github: Issues',
  parameters: GithubIssuesGetCommentsSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'Get Github Issue Comments',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubIssuesGetCommentsTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubIssuesGetCommentsToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubIssuesGetCommentsSchema, args);

    return this.cleanResponse(await this.getClient().rest.issues.listComments(apiParams));
  }
}
