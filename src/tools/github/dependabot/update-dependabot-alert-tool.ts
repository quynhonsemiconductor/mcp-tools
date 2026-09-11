import type { Octokit } from 'octokit';
import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { GithubBaseSchema } from '../schemas/base-schema';

type UpdateAlertParams = NonNullable<Parameters<Octokit['rest']['dependabot']['updateAlert']>[0]>;

/**
 * Schema definition for the Update Dependabot Alert tool parameters
 */
export const UpdateDependabotAlertSchema = GithubBaseSchema.extend({
  alert_number: z.number().int().positive().describe('The dependabot alert number'),
  state: z.enum(['dismissed', 'open']).describe('The state of the Dependabot alert'),
  dismissed_reason: z
    .enum(['fix_started', 'inaccurate', 'no_bandwidth', 'not_used', 'tolerable_risk'])
    .optional()
    .describe('A reason for dismissing the alert'),
  dismissed_comment: z.string().optional().describe('Reason for dismissal'),
}).refine(
  (data) => {
    // If state is dismissed, dismissed_reason is required
    return data.state !== 'dismissed' || data.dismissed_reason !== undefined;
  },
  {
    message: "dismissed_reason is required when state is 'dismissed'",
    path: ['dismissed_reason'],
  },
);

/**
 * Type for the Update Dependabot Alert tool parameters
 */
export type UpdateDependabotAlertToolParams = z.infer<typeof UpdateDependabotAlertSchema>;

/**
 * Update Dependabot Alert - Updates a Dependabot alert
 */
@Tool({
  id: 'github-update-dependabot-alert',
  name: 'updateDependabotAlert',
  description: 'Updates a Dependabot alert',
  category: 'Github: Dependabot',
  parameters: UpdateDependabotAlertSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Update Dependabot Alert',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class UpdateDependabotAlertTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: UpdateDependabotAlertToolParams): Promise<string> {
    const validatedArgs = UpdateDependabotAlertSchema.parse(args);

    const { org, repo, alert_number, state, dismissed_reason, dismissed_comment } = validatedArgs;

    const apiParams: UpdateAlertParams = {
      owner: org,
      repo,
      alert_number,
      state,
    };

    if (dismissed_reason) apiParams.dismissed_reason = dismissed_reason;
    if (dismissed_comment) apiParams.dismissed_comment = dismissed_comment;

    return this.cleanResponse(await this.getClient().rest.dependabot.updateAlert(apiParams), false);
  }
}
