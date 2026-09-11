import fs from 'fs';
import os from 'os';
import path from 'path';
import { z } from 'zod';
import { ensureRepositoryUpToDate } from '../../../utils/git';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema } from '../schemas';

/**
 * Schema definition for the getGithubWikiContent tool parameters
 */
export const GithubWikiGetContentToolSchema = createGithubBaseSchema({
  page: z.string().describe('Wiki page filename (e.g., "Home.md", "Installation-Guide.md")'),
});

/**
 * Type for the getGithubWikiContent tool parameters
 */
export type GithubWikiGetContentToolParams = z.infer<typeof GithubWikiGetContentToolSchema>;

/**
 * Get GitHub Wiki Content - Gets the content of a specific page from a GitHub wiki repository
 */
@Tool({
  id: 'github-wiki-get-content',
  name: 'getGithubWikiContent',
  description: 'Gets the content of a specific page from a GitHub wiki repository',
  category: 'Github: Wiki',
  parameters: GithubWikiGetContentToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Get GitHub Wiki Content',
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
})
export class GithubWikiGetContentTool extends GithubBaseTool {
  /**
   * Get the local cache path for a wiki repository
   */
  private getWikiCachePath(org: string, repo: string): string {
    return path.join(os.homedir(), '.qnscmcp', 'wikis', org, `${repo}.wiki`);
  }

  /**
   * Execute the tool
   */
  @CatchErrors()
  async execute(args: GithubWikiGetContentToolParams): Promise<string> {
    const wikiPath = this.getWikiCachePath(args.org, args.repo);

    // Ensure wiki is cloned/updated to get latest content (uses shallow clone via git utils)
    await ensureRepositoryUpToDate(
      {
        repo: `${args.org}/${args.repo}.wiki`,
        branch: 'master',
      },
      wikiPath,
    );

    // Read the wiki page from filesystem
    const pagePath = path.join(wikiPath, args.page);

    if (!fs.existsSync(pagePath)) {
      throw new Error(`Wiki page "${args.page}" not found in ${args.org}/${args.repo} wiki`);
    }

    const content = fs.readFileSync(pagePath, 'utf-8');

    return JSON.stringify({
      org: args.org,
      repo: args.repo,
      page: args.page,
      content,
      size: content.length,
    });
  }
}
