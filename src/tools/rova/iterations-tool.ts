/**
 * iterations-tool.ts — sprints, and how one is going.
 *
 * Two tools rather than one. Listing iterations answers "which sprint are we in"; the
 * status endpoint answers "how is it going" and is the more valuable of the two, because
 * Rova computes the metrics and the assigned work in a single call rather than leaving a
 * caller to add up work items itself.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors } from '../../utils';
import { rovaItems, rovaRequest, type RovaPage } from './api';

interface RovaIteration {
  id?: string;
  name?: string;
  state?: string;
  startDate?: string | null;
  endDate?: string | null;
  projectId?: string;
  teamId?: string | null;
  plannedVelocity?: number | null;
}

export const ListRovaIterationsSchema = z.object({
  projectId: z.string().min(1).describe('Project whose iterations to list, from listRovaProjects'),
  limit: z.number().int().min(1).max(100).default(25).describe('Maximum iterations to return'),
});

export type ListRovaIterationsParams = z.input<typeof ListRovaIterationsSchema>;

@Tool({
  id: 'rova-list-iterations',
  name: 'listRovaIterations',
  description:
    'List the iterations (sprints) of a Rova project with their dates and state. Use to find the current sprint, then pass its id to getRovaIterationStatus.',
  category: 'Rova',
  // Declared so the bundle offers a prompt for it at install and passes it through.
  // Without this the tools appear with no way to supply a token, and every call fails
  // on a missing variable — which is how ROVA_API_TOKEN was first shipped.
  envVars: ['ROVA_API_TOKEN'],
  optionalEnvVars: ['ROVA_API_URL'],
  parameters: ListRovaIterationsSchema,
  version: '1.0.0',
  annotations: { title: 'List Rova Iterations', readOnlyHint: true, openWorldHint: true },
})
export class ListRovaIterationsTool implements ToolHandler {
  /**
   * List iterations for a project.
   *
   * @param args - Project and a limit
   * @returns JSON string of iterations, marking which covers today
   */
  @CatchErrors()
  async execute(args: ListRovaIterationsParams): Promise<string> {
    const { projectId, limit } = ListRovaIterationsSchema.parse(args);
    const body = await rovaRequest<RovaPage<RovaIteration>>(
      `/iterations?projectId=${encodeURIComponent(projectId)}&limit=${limit}`,
    );
    const iterations = rovaItems(body);
    const today = new Date().toISOString().slice(0, 10);

    return JSON.stringify(
      {
        projectId,
        count: iterations.length,
        iterations: iterations.map((iteration) => ({
          iterationId: iteration.id,
          name: iteration.name,
          state: iteration.state,
          start: iteration.startDate || undefined,
          end: iteration.endDate || undefined,
          plannedVelocity: iteration.plannedVelocity ?? undefined,
          // Marked rather than left to be worked out from two dates: "the current
          // sprint" is what is being asked for nearly every time.
          ...(iteration.startDate &&
          iteration.endDate &&
          iteration.startDate.slice(0, 10) <= today &&
          today <= iteration.endDate.slice(0, 10)
            ? { current: true }
            : {}),
        })),
      },
      null,
      2,
    );
  }
}

export const GetRovaIterationStatusSchema = z.object({
  iterationId: z.string().min(1).describe('Iteration id, from listRovaIterations'),
});

export type GetRovaIterationStatusParams = z.input<typeof GetRovaIterationStatusSchema>;

@Tool({
  id: 'rova-get-iteration-status',
  name: 'getRovaIterationStatus',
  description:
    'Get the status of a Rova iteration: its metrics and the work assigned to it. Use for how a sprint is going, what is left, or what is at risk.',
  category: 'Rova',
  // Declared so the bundle offers a prompt for it at install and passes it through.
  // Without this the tools appear with no way to supply a token, and every call fails
  // on a missing variable — which is how ROVA_API_TOKEN was first shipped.
  envVars: ['ROVA_API_TOKEN'],
  optionalEnvVars: ['ROVA_API_URL'],
  parameters: GetRovaIterationStatusSchema,
  version: '1.0.0',
  annotations: { title: 'Get Rova Iteration Status', readOnlyHint: true, openWorldHint: true },
})
export class GetRovaIterationStatusTool implements ToolHandler {
  /**
   * Read an iteration's computed status.
   *
   * Returned close to as Rova sends it: this endpoint exists precisely to do the
   * arithmetic, and reshaping it here would risk describing the numbers wrongly.
   *
   * @param args - Iteration id
   * @returns JSON string of the iteration's metrics and work
   */
  @CatchErrors()
  async execute(args: GetRovaIterationStatusParams): Promise<string> {
    const { iterationId } = GetRovaIterationStatusSchema.parse(args);
    const status = await rovaRequest<Record<string, unknown>>(
      `/iterations/${encodeURIComponent(iterationId)}/status`,
    );
    return JSON.stringify({ iterationId, ...status }, null, 2);
  }
}
