import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { GithubBaseSchema } from '../schemas/base-schema';

/**
 * Schema definition for the Get Dependabot Alert tool parameters
 */
export const GetDependabotAlertSchema = GithubBaseSchema.extend({
  alert_number: z.number().int().positive().describe('The dependabot alert number'),
});

/**
 * Type for the Get Dependabot Alert tool parameters
 */
export type GetDependabotAlertToolParams = z.infer<typeof GetDependabotAlertSchema>;

/**
 * Get Dependabot Alert - Retrieves a specific Dependabot alert
 */
@Tool({
  id: 'github-get-dependabot-alert',
  name: 'getDependabotAlert',
  description: 'Retrieves a Dependabot alert',
  category: 'Github: Dependabot',
  parameters: GetDependabotAlertSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Get Dependabot Alert',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GetDependabotAlertTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GetDependabotAlertToolParams): Promise<string> {
    const validatedArgs = GetDependabotAlertSchema.parse(args);

    const { org, repo, alert_number } = validatedArgs;

    const apiParams: { owner: string; repo: string; alert_number: number } = {
      owner: org,
      repo,
      alert_number,
    };

    return this.cleanResponse(await this.getClient().rest.dependabot.getAlert(apiParams), false);
  }
}
