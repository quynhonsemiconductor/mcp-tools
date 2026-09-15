/**
 * search-work-items-tool.ts — find work items in a project.
 *
 * The general list, as opposed to `listMyRovaWorkItems` which answers only "mine". Rova
 * scopes this collection to a project and refuses it otherwise, so projectId is required
 * rather than optional — an optional parameter here would produce a
 * PROJECT_PERMISSION_DENIED that reads like missing access.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors } from '../../utils';
import { rovaItems, rovaRequest, type RovaPage } from './api';
import { summariseWorkItem, type RovaWorkItem } from './types';
import { ROVA_SCHEDULE_STATES, ROVA_WORK_ITEM_TYPES } from './create-work-item-tool';

export const SearchRovaWorkItemsSchema = z.object({
  projectId: z
    .string()
    .min(1)
    .describe('Project to search, from listRovaProjects. Rova requires a project here.'),
  type: z.enum(ROVA_WORK_ITEM_TYPES).optional().describe('Restrict to one type'),
  state: z
    .enum(ROVA_SCHEDULE_STATES)
    .optional()
    .describe(
      'Restrict to one schedule state. Spelled with underscores as the schema does, and the terminal state is "release".',
    ),
  assigneeId: z.string().optional().describe('Restrict to items assigned to this user id'),
  iterationId: z.string().optional().describe('Restrict to one iteration'),
  limit: z.number().int().min(1).max(100).default(25).describe('Maximum items to return'),
});

export type SearchRovaWorkItemsParams = z.input<typeof SearchRovaWorkItemsSchema>;

@Tool({
  id: 'rova-search-work-items',
  name: 'searchRovaWorkItems',
  description:
    'List or filter Rova work items within a project, by type, state, assignee or iteration. Needs a projectId from listRovaProjects. For items assigned to the caller across all projects, use listMyRovaWorkItems instead.',
  category: 'Rova',
  // Declared so the bundle offers a prompt for it at install and passes it through.
  // Without this the tools appear with no way to supply a token, and every call fails
  // on a missing variable — which is how ROVA_API_TOKEN was first shipped.
  envVars: ['ROVA_API_TOKEN'],
  optionalEnvVars: ['ROVA_API_URL'],
  parameters: SearchRovaWorkItemsSchema,
  version: '1.0.0',
  annotations: {
    title: 'Search Rova Work Items',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class SearchRovaWorkItemsTool implements ToolHandler {
  /**
   * Search within a project.
   *
   * @param args - Project and optional filters
   * @returns JSON string of matching item summaries
   */
  @CatchErrors()
  async execute(args: SearchRovaWorkItemsParams): Promise<string> {
    const { projectId, type, state, assigneeId, iterationId, limit } =
      SearchRovaWorkItemsSchema.parse(args);

    const params = new URLSearchParams({ projectId, limit: String(limit) });
    if (type) params.set('type', type);
    if (state) params.set('scheduleState', state);
    if (assigneeId) params.set('assigneeId', assigneeId);
    if (iterationId) params.set('iterationId', iterationId);

    const body = await rovaRequest<RovaPage<RovaWorkItem>>(`/work-items?${params.toString()}`);
    const items = rovaItems(body);

    return JSON.stringify(
      {
        projectId,
        filters: { type, state, assigneeId, iterationId },
        count: items.length,
        // The total says whether the limit hid anything, which a count of returned rows
        // alone cannot.
        totalMatching: body?.pageInfo?.total,
        items: items.map(summariseWorkItem),
      },
      null,
      2,
    );
  }
}
