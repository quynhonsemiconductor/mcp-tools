import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Add Github Issue Comment tool parameters
 */
export const GithubIssuesAddCommentSchema = createGithubBaseSchema({
  issue_number: z.number().int().min(1).describe('The issue number'),
  body: z.string().min(1).describe('Comment text'),
});

/**
 * Type for the Add Github Issue Comment tool parameters
 */
export type GithubIssuesAddCommentToolParams = z.infer<typeof GithubIssuesAddCommentSchema>;

/**
 * Add Github Issue Comment - Adds a comment to an issue in a GitHub repository
 */
@Tool({
  id: 'github-issues-add-comment',
  name: 'addGithubIssueComment',
  description: 'Adds a comment to an issue in a GitHub repository',
  category: 'Github: Issues',
  parameters: GithubIssuesAddCommentSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'Add Github Issue Comment',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubIssuesAddCommentTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubIssuesAddCommentToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubIssuesAddCommentSchema, args);

    return this.cleanResponse(await this.getClient().rest.issues.createComment(apiParams));
  }
}
