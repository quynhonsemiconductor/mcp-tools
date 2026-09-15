/**
 * list-my-work-tool.ts — what Rova has assigned to this person.
 *
 * The question asked most often, and the one thing a tracker should answer without being
 * told where to look. Rova serves it from a dedicated endpoint that scopes by assignee
 * and by readable project at once, so no project id is needed.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors } from '../../utils';
import { rovaItems, rovaRequest, type RovaPage } from './api';
import { summariseWorkItem, type RovaWorkItem } from './types';

export const ListMyRovaWorkSchema = z.object({
  limit: z.number().int().min(1).max(100).default(25).describe('Maximum items to return'),
});

export type ListMyRovaWorkParams = z.input<typeof ListMyRovaWorkSchema>;

@Tool({
  id: 'rova-list-my-work',
  name: 'listMyRovaWorkItems',
  description:
    'List the Rova work items assigned to the signed-in user across every project they can read. Use for questions about what someone is working on or what is on their plate.',
  category: 'Rova',
  // Declared so the bundle offers a prompt for it at install and passes it through.
  // Without this the tools appear with no way to supply a token, and every call fails
  // on a missing variable — which is how ROVA_API_TOKEN was first shipped.
  envVars: ['ROVA_API_TOKEN'],
  optionalEnvVars: ['ROVA_API_URL'],
  parameters: ListMyRovaWorkSchema,
  version: '1.0.0',
  annotations: {
    title: 'List My Rova Work Items',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class ListMyRovaWorkTool implements ToolHandler {
  /**
   * List the caller's assigned work.
   *
   * @param args - Result limit
   * @returns JSON string of assigned items, grouped by project
   */
  @CatchErrors()
  async execute(args: ListMyRovaWorkParams): Promise<string> {
    const { limit } = ListMyRovaWorkSchema.parse(args);

    const body = await rovaRequest<RovaPage<RovaWorkItem> | RovaWorkItem[]>(
      `/work-items/my?limit=${limit}`,
    );
    const items = rovaItems(body);

    // Grouped by project because a flat list of items from five projects reads as one
    // undifferentiated pile, and "what am I working on" is usually really "where".
    const byProject = new Map<string, ReturnType<typeof summariseWorkItem>[]>();
    for (const item of items) {
      const key = item.projectKey ?? item.projectName ?? 'unknown';
      if (!byProject.has(key)) byProject.set(key, []);
      // The project is already the grouping key, so repeating it on every row is noise.
      const { project: _project, ...rest } = summariseWorkItem(item);
      byProject.get(key)!.push(rest as ReturnType<typeof summariseWorkItem>);
    }

    return JSON.stringify(
      {
        count: items.length,
        ...(items.length === 0
          ? { note: 'Nothing is assigned to you in any project you can read.' }
          : {}),
        byProject: Object.fromEntries(byProject),
      },
      null,
      2,
    );
  }
}
