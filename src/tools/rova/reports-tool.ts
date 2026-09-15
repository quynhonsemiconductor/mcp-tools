/**
 * reports-tool.ts — Rova's computed reports, behind one tool.
 *
 * Five report endpoints, one tool. They share a shape — ask for a report, name the thing
 * it is about, get numbers back — so five separate tools would put five near-identical
 * descriptions in front of the model on every request for no gain in clarity.
 *
 * Each report takes a different scope, and that is the part worth getting right: burndown
 * and team capacity are per iteration, release tracking is per release, and velocity spans
 * a run of recent sprints. Asking for the wrong one produces a validation failure rather
 * than a wrong answer, which is the better failure but still a wasted round trip, so the
 * scope is checked here.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors, UserError } from '../../utils';
import { rovaRequest } from './api';

/** The reports Rova computes, by the path each is served from. */
const REPORTS = {
  'iteration-burndown': {
    path: '/reports/iteration-burndown',
    scope: 'iterationId',
    about: 'Remaining work per day across an iteration',
  },
  velocity: {
    path: '/reports/velocity',
    scope: 'projectId',
    about: 'Accepted points over recent sprints',
  },
  'team-capacity': {
    path: '/reports/team-capacity',
    scope: 'iterationId',
    about: 'Capacity against committed work for an iteration',
  },
  'release-tracking': {
    path: '/reports/release-tracking',
    scope: 'releaseId',
    about: 'Direct, derived and unparented work in a release',
  },
  'release-burnup': {
    path: '/reports/release-tracking/burnup',
    scope: 'releaseId',
    about: 'Accepted against planned over a release',
  },
} as const;

export type RovaReportName = keyof typeof REPORTS;

export const GetRovaReportSchema = z.object({
  report: z
    .enum(Object.keys(REPORTS) as [RovaReportName, ...RovaReportName[]])
    .describe(
      'Which report: iteration-burndown, velocity, team-capacity, release-tracking or release-burnup',
    ),
  iterationId: z
    .string()
    .optional()
    .describe('Required for iteration-burndown and team-capacity, from listRovaIterations'),
  releaseId: z
    .string()
    .optional()
    .describe('Required for release-tracking and release-burnup, from listRovaReleases'),
  // Required for every report, not only velocity. The permission guard is
  // @RequirePermission('report:view', { from: 'query', field: 'projectId' }), so it reads
  // projectId out of the query string regardless of what the report itself is scoped by.
  // Omitting it resolves the permission against nothing and the request is refused as
  // PROJECT_PERMISSION_DENIED, which reads as missing access rather than a missing
  // parameter. The request DTOs do not mention it, so only the guard reveals this.
  projectId: z
    .string()
    .min(1)
    .describe('Project the report belongs to, from listRovaProjects. Required for every report.'),
});

export type GetRovaReportParams = z.input<typeof GetRovaReportSchema>;

@Tool({
  id: 'rova-get-report',
  name: 'getRovaReport',
  description:
    'Run a Rova report: iteration burndown, velocity over recent sprints, team capacity, release tracking or release burnup. Each needs the id of what it is about — an iteration, a release or a project.',
  category: 'Rova',
  // Declared so the bundle offers a prompt for it at install and passes it through.
  // Without this the tools appear with no way to supply a token, and every call fails
  // on a missing variable — which is how ROVA_API_TOKEN was first shipped.
  envVars: ['ROVA_API_TOKEN'],
  optionalEnvVars: ['ROVA_API_URL'],
  parameters: GetRovaReportSchema,
  version: '1.0.0',
  annotations: { title: 'Get Rova Report', readOnlyHint: true, openWorldHint: true },
})
export class GetRovaReportTool implements ToolHandler {
  /**
   * Run one report.
   *
   * @param args - Report name and the id it is scoped to
   * @returns JSON string of the report as Rova computed it
   */
  @CatchErrors()
  async execute(args: GetRovaReportParams): Promise<string> {
    const { report, iterationId, releaseId, projectId } = GetRovaReportSchema.parse(args);
    const spec = REPORTS[report];

    const supplied: Record<string, string | undefined> = { iterationId, releaseId, projectId };
    const value = supplied[spec.scope];
    if (!value) {
      throw new UserError(
        `The ${report} report is scoped by ${spec.scope}, which was not given. ` +
          `It reports on: ${spec.about}.`,
      );
    }

    const params = new URLSearchParams({ projectId, [spec.scope]: value });
    // Returned as Rova computes it. These endpoints exist to do the arithmetic, and
    // reshaping the numbers here would risk relabelling them.
    const body = await rovaRequest<Record<string, unknown>>(`${spec.path}?${params.toString()}`);

    return JSON.stringify({ report, [spec.scope]: value, about: spec.about, ...body }, null, 2);
  }
}
