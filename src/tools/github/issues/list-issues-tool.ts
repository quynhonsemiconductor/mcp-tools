import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the List Github Issues tool parameters
 */
export const GithubIssuesListSchema = createGithubBaseSchema({
  state: z
    .enum(['open', 'closed', 'all'])
    .optional()
    .describe("Filter by state ('open', 'closed', 'all')"),
  labels: z.string().optional().describe('Labels to filter by'),
  sort: z
    .enum(['created', 'updated', 'comments'])
    .optional()
    .describe("Sort by ('created', 'updated', 'comments')"),
  direction: z.enum(['asc', 'desc']).optional().describe("Sort direction ('asc', 'desc')"),
  since: z.string().optional().describe('Filter by date (ISO 8601 timestamp)'),
  page: z.number().int().min(1).optional().describe('Page number'),
  per_page: z.number().int().min(1).max(100).default(10).describe('Results per page'),
});

/**
 * Type for the List Github Issues tool parameters
 */
export type GithubIssuesListToolParams = z.input<typeof GithubIssuesListSchema>;

/**
 * List Github Issues - Lists and filters repository issues
 */
@Tool({
  id: 'github-issues-list',
  name: 'listGithubIssues',
  description: 'Lists and filters repository issues',
  category: 'Github: Issues',
  parameters: GithubIssuesListSchema,
  envVars: ['GITHUB_TOKEN'],
  includeByDefault: true,
  version: '1.0.1',
  annotations: {
    title: 'List Github Issues',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubIssuesListTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubIssuesListToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubIssuesListSchema, args);

    return this.cleanResponse(await this.getClient().rest.issues.listForRepo(apiParams), true);
  }
}
