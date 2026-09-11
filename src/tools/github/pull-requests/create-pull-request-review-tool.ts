import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

// Define the structure for inline comments
const ReviewCommentSchema = z.object({
  path: z.string().describe('The path to the file being commented on'),
  position: z
    .number()
    .optional()
    .describe('The position in the diff where the comment should be placed'),
  line: z
    .number()
    .optional()
    .describe('The line number in the file where the comment should be placed'),
  start_line: z.number().optional().describe('For multi-line comments, the starting line number'),
  start_side: z
    .enum(['LEFT', 'RIGHT'])
    .optional()
    .describe('The side of the diff to place the comment'),
  side: z
    .enum(['LEFT', 'RIGHT'])
    .optional()
    .describe('The side of the diff for the comment line (multi-line only)'),
  body: z.string().describe('The text of the comment'),
});

/**
 * Schema definition for the Create Github Pull Request Review tool parameters
 */
export const GithubPullRequestCreateReviewSchema = createGithubBaseSchema({
  pull_number: z.number().int().min(1).describe('Pull request number'),
  event: z
    .enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT'])
    .describe("Review action ('APPROVE', 'REQUEST_CHANGES', 'COMMENT')"),
  body: z.string().optional().describe('Review comment text'),
  commit_id: z.string().optional().describe('SHA of commit to review'),
  comments: z
    .array(ReviewCommentSchema)
    .optional()
    .describe('Line-specific comments to place on pull request changes'),
});

/**
 * Type for the Create Github Pull Request Review tool parameters
 */
export type GithubPullRequestCreateReviewToolParams = z.infer<
  typeof GithubPullRequestCreateReviewSchema
>;

/**
 * Create Github Pull Request Review - Creates a review on a pull request
 */
@Tool({
  id: 'github-pulls-create-review',
  name: 'createGithubPullRequestReview',
  description: 'Creates a review on a pull request',
  category: 'Github: Pulls',
  parameters: GithubPullRequestCreateReviewSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'Create Github Pull Request Review',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubPullRequestCreateReviewTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubPullRequestCreateReviewToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubPullRequestCreateReviewSchema, args);

    return this.cleanResponse(await this.getClient().rest.pulls.createReview(apiParams));
  }
}
