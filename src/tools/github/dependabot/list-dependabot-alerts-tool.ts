import type { Octokit } from 'octokit';
import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { GithubBaseSchema } from '../schemas/base-schema';

type ListAlertsForRepoParams = NonNullable<
  Parameters<Octokit['rest']['dependabot']['listAlertsForRepo']>[0]
>;

/**
 * Schema definition for the List Dependabot Alerts tool parameters
 */
export const ListDependabotAlertsSchema = GithubBaseSchema.extend({
  state: z
    .enum(['auto_dismissed', 'dismissed', 'fixed', 'open'])
    .optional()
    .describe('A comma-separated list of states.'),
  severity: z
    .enum(['low', 'medium', 'high', 'critical'])
    .optional()
    .describe('A comma-separated list of severities'),
  ecosystem: z
    .enum(['composer', 'go', 'maven', 'npm', 'nuget', 'pip', 'pub', 'rubygems', 'rust'])
    .optional()
    .describe('A comma-separated list of ecosystems'),
  package: z.string().optional().describe('A comma-separated list of package names.'),
  manifest: z.string().optional().describe('A comma-separated list of full manifest paths.'),
  epss_percentage: z
    .string()
    .optional()
    .describe('CVE Exploit Prediction Scoring System (EPSS) percentage.'),
  scope: z
    .enum(['development', 'runtime'])
    .optional()
    .describe('The scope of the vulnerable dependency.'),
  per_page: z.number().int().min(1).max(100).default(10).describe('The number of results per page'),
  page: z.number().int().min(1).default(1).describe('The page number of the results to fetch'),
});

/**
 * Type for the List Dependabot Alerts tool parameters
 */
export type ListDependabotAlertsToolParams = z.input<typeof ListDependabotAlertsSchema>;

/**
 * List Dependabot Alerts - Lists all Dependabot alerts for a repository
 */
@Tool({
  id: 'github-list-dependabot-alerts',
  name: 'listDependabotAlerts',
  description: 'List Dependabot alerts for a repository',
  category: 'Github: Dependabot',
  parameters: ListDependabotAlertsSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'List Dependabot Alerts',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class ListDependabotAlertsTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: ListDependabotAlertsToolParams): Promise<string> {
    const validatedArgs = ListDependabotAlertsSchema.parse(args);

    const {
      org,
      repo,
      state,
      severity,
      ecosystem,
      package: pkg,
      manifest,
      epss_percentage,
      scope,
      per_page,
      page,
    } = validatedArgs;

    const apiParams: ListAlertsForRepoParams = {
      owner: org,
      repo,
      per_page,
      page,
    };

    if (state) apiParams.state = state;
    if (severity) apiParams.severity = severity;
    if (ecosystem) apiParams.ecosystem = ecosystem;
    if (pkg) apiParams.package = pkg;
    if (manifest) apiParams.manifest = manifest;
    if (epss_percentage) apiParams.epss_percentage = epss_percentage;
    if (scope) apiParams.scope = scope;

    return this.cleanResponse(
      await this.getClient().rest.dependabot.listAlertsForRepo(apiParams),
      true,
    );
  }
}
