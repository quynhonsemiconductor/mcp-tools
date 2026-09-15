/**
 * defects-tool.ts — defects in a project, with the numbers Rova already computes.
 *
 * Distinct from searching work items with type=defect: Rova serves this from its quality
 * module and returns metrics alongside the rows, so counts by severity or state arrive
 * without a caller tallying them.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors } from '../../utils';
import { rovaItems, rovaRequest, type RovaPage } from './api';
import { summariseWorkItem, type RovaWorkItem } from './types';

export const ListRovaDefectsSchema = z.object({
  projectId: z.string().min(1).describe('Project whose defects to list, from listRovaProjects'),
  limit: z.number().int().min(1).max(100).default(25).describe('Maximum defects to return'),
});

export type ListRovaDefectsParams = z.input<typeof ListRovaDefectsSchema>;

@Tool({
  id: 'rova-list-defects',
  name: 'listRovaDefects',
  description:
    'List the defects in a Rova project with the metrics Rova computes for them. Prefer this over searching work items by type when the question is about defect counts, severity or quality.',
  category: 'Rova',
  parameters: ListRovaDefectsSchema,
  version: '1.0.0',
  annotations: { title: 'List Rova Defects', readOnlyHint: true, openWorldHint: true },
})
export class ListRovaDefectsTool implements ToolHandler {
  /**
   * List defects and whatever metrics accompany them.
   *
   * @param args - Project and a limit
   * @returns JSON string of defect summaries plus Rova's metrics
   */
  @CatchErrors()
  async execute(args: ListRovaDefectsParams): Promise<string> {
    const { projectId, limit } = ListRovaDefectsSchema.parse(args);
    const body = await rovaRequest<RovaPage<RovaWorkItem> & Record<string, unknown>>(
      `/quality/defects?projectId=${encodeURIComponent(projectId)}&limit=${limit}`,
    );
    const defects = rovaItems<RovaWorkItem>(body);

    // Anything alongside `data` and `pageInfo` is the metrics this endpoint exists to
    // provide, and it is passed through rather than guessed at field by field: naming
    // them here would go stale the moment Rova adds one.
    const { data: _data, pageInfo, ...metrics } = body ?? {};

    return JSON.stringify(
      {
        projectId,
        count: defects.length,
        totalMatching: pageInfo?.total,
        ...(Object.keys(metrics).length > 0 ? { metrics } : {}),
        defects: defects.map(summariseWorkItem),
      },
      null,
      2,
    );
  }
}
