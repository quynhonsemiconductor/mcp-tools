import { z } from 'zod';

/** src/tools/github env vars */
export const githubEnvSchema = z.object({
  GITHUB_TOKEN: z.string().optional().describe('Github personal access token'),

  GH_API_URL: z
    .string()
    .url()
    .optional()
    .describe('GitHub API base URL')
    .default('https://api.github.com'),
});
