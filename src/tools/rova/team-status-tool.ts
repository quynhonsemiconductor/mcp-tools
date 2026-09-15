/**
 * team-status-tool.ts — who is working on what in an iteration.
 *
 * The standup view. Rova requires both a project and an iteration, and refuses the request
 * with a validation failure if either is missing, so both are required here rather than
 * discovered by a failed call.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors } from '../../utils';
import { rovaRequest } from './api';

export const GetRovaTeamStatusSchema = z.object({
  projectId: z.string().min(1).describe('Project, from listRovaProjects'),
  iterationId: z
    .string()
    .min(1)
    .describe('Iteration to report on, from listRovaIterations. Rova requires this as well as the project.'),
  teamId: z.string().optional().describe('Restrict to one team within the project'),
});

export type GetRovaTeamStatusParams = z.input<typeof GetRovaTeamStatusSchema>;

@Tool({
  id: 'rova-get-team-status',
  name: 'getRovaTeamStatus',
  description:
    'Get Rova team status for an iteration: who is working on what, with their load. Use for standup questions, or who has capacity. Needs both a projectId and an iterationId.',
  category: 'Rova',
  // Declared so the bundle offers a prompt for it at install and passes it through.
  // Without this the tools appear with no way to supply a token, and every call fails
  // on a missing variable — which is how ROVA_API_TOKEN was first shipped.
  envVars: ['ROVA_API_TOKEN'],
  optionalEnvVars: ['ROVA_API_URL'],
  parameters: GetRovaTeamStatusSchema,
  version: '1.0.0',
  annotations: { title: 'Get Rova Team Status', readOnlyHint: true, openWorldHint: true },
})
export class GetRovaTeamStatusTool implements ToolHandler {
  /**
   * Read team status for an iteration.
   *
   * @param args - Project, iteration and an optional team
   * @returns JSON string of the status as Rova assembles it
   */
  @CatchErrors()
  async execute(args: GetRovaTeamStatusParams): Promise<string> {
    const { projectId, iterationId, teamId } = GetRovaTeamStatusSchema.parse(args);
    const params = new URLSearchParams({ projectId, iterationId });
    if (teamId) params.set('teamId', teamId);

    // Passed through as Rova assembles it: this view groups members against their work and
    // capacity, and reshaping it here would risk mislabelling whose hours are whose.
    const status = await rovaRequest<Record<string, unknown>>(`/team-status?${params.toString()}`);
    return JSON.stringify({ projectId, iterationId, ...status }, null, 2);
  }
}
