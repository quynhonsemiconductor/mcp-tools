/**
 * get-work-item-tool.ts — one work item in full, with its tasks and history.
 *
 * The counterpart to the lists, which return a summary. This is where the fields worth
 * reading in detail live: description, acceptance criteria, the defect columns, and the
 * hour estimates.
 *
 * An item can be named by its key, which is what people actually say — "look at DE-17" —
 * rather than by a uuid nobody has to hand. Rova serves both, on separate routes.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors, UserError } from '../../utils';
import { rovaItems, rovaRequest, type RovaPage } from './api';
import type { RovaWorkItem } from './types';

export const GetRovaWorkItemSchema = z
  .object({
    itemKey: z
      .string()
      .optional()
      .describe('Item key as people refer to it, e.g. "DE-17" or "US-118"'),
    id: z.string().optional().describe('Item uuid, if the key is not to hand'),
    includeTasks: z.boolean().default(true).describe('Include the item\'s tasks'),
    includeActivity: z
      .boolean()
      .default(false)
      .describe('Include the change history. Off by default: it is long and rarely the question.'),
  })
  .describe('Read one Rova work item');

export type GetRovaWorkItemParams = z.input<typeof GetRovaWorkItemSchema>;

interface RovaTask {
  id?: string;
  title?: string;
  state?: string;
  assigneeName?: string | null;
  estimateHours?: number | null;
  actualHours?: number | null;
  todoHours?: number | null;
}

interface RovaActivity {
  id?: string;
  createdAt?: string;
  actorName?: string | null;
  action?: string;
  field?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
}

@Tool({
  id: 'rova-get-work-item',
  name: 'getRovaWorkItem',
  description:
    'Read one Rova work item in full by its key, such as DE-17 or US-118, including description, acceptance criteria, estimates and its tasks. Pass includeActivity for the change history.',
  category: 'Rova',
  // Declared so the bundle offers a prompt for it at install and passes it through.
  // Without this the tools appear with no way to supply a token, and every call fails
  // on a missing variable — which is how ROVA_API_TOKEN was first shipped.
  envVars: ['ROVA_API_TOKEN'],
  optionalEnvVars: ['ROVA_API_URL'],
  parameters: GetRovaWorkItemSchema,
  version: '1.0.0',
  annotations: {
    title: 'Get Rova Work Item',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GetRovaWorkItemTool implements ToolHandler {
  /**
   * Read an item by key or id.
   *
   * @param args - Key or id, and what to include
   * @returns JSON string of the item, its tasks and optionally its history
   */
  @CatchErrors()
  async execute(args: GetRovaWorkItemParams): Promise<string> {
    const { itemKey, id, includeTasks, includeActivity } = GetRovaWorkItemSchema.parse(args);
    if (!itemKey && !id) {
      throw new UserError('Give either itemKey, such as "DE-17", or the item id.');
    }

    const item = itemKey
      ? await rovaRequest<RovaWorkItem>(`/work-items/by-key?itemKey=${encodeURIComponent(itemKey)}`)
      : await rovaRequest<RovaWorkItem>(`/work-items/${encodeURIComponent(String(id))}`);

    const resolvedId = item.id ?? id;
    let tasks: RovaTask[] = [];
    let activity: RovaActivity[] = [];

    if (includeTasks && resolvedId) {
      // Failing to read the tasks should not lose the item itself, which is the part
      // that was asked for.
      try {
        tasks = rovaItems(
          await rovaRequest<RovaPage<RovaTask>>(`/work-items/${encodeURIComponent(resolvedId)}/tasks`),
        );
      } catch {
        tasks = [];
      }
    }
    if (includeActivity && resolvedId) {
      try {
        activity = rovaItems(
          await rovaRequest<RovaPage<RovaActivity>>(
            `/work-items/${encodeURIComponent(resolvedId)}/activity`,
          ),
        );
      } catch {
        activity = [];
      }
    }

    return JSON.stringify(
      {
        itemKey: item.itemKey,
        id: item.id,
        title: item.title,
        type: item.type,
        state: item.scheduleState ?? item.flowState,
        priority: item.priority || undefined,
        severity: item.severity || undefined,
        storyPoints: item.storyPoints ?? undefined,
        assignee: item.assigneeName || undefined,
        devOwner: item.devOwnerName || undefined,
        project: item.projectKey || item.projectName,
        iterationId: item.iterationId || undefined,
        releaseId: item.releaseId || undefined,
        parentId: item.parentId || undefined,
        ...(item.isBlocked ? { blocked: item.blockedReason || 'blocked' } : {}),
        hours: {
          estimate: item.estimateHours ?? undefined,
          actual: item.actualHours ?? undefined,
          todo: item.todoHours ?? undefined,
        },
        description: item.description || undefined,
        acceptanceCriteria: item.acceptanceCriteria || undefined,
        notes: item.notes || undefined,
        // Defect-only fields, omitted for a story rather than shown as nulls.
        ...(item.type === 'defect'
          ? {
              defect: {
                state: item.defectState || undefined,
                resolution: item.resolution || undefined,
                rootCause: item.rootCause || undefined,
                foundIn: item.foundInEnvironment || undefined,
                fixedInBuild: item.fixedInBuild || undefined,
              },
            }
          : {}),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        ...(includeTasks
          ? {
              tasks: tasks.map((task) => ({
                id: task.id,
                title: task.title,
                state: task.state,
                assignee: task.assigneeName || undefined,
                hours: {
                  estimate: task.estimateHours ?? undefined,
                  actual: task.actualHours ?? undefined,
                  todo: task.todoHours ?? undefined,
                },
              })),
            }
          : {}),
        ...(includeActivity
          ? {
              activity: activity.map((entry) => ({
                at: entry.createdAt,
                by: entry.actorName || undefined,
                action: entry.action,
                field: entry.field || undefined,
                from: entry.fromValue || undefined,
                to: entry.toValue || undefined,
              })),
            }
          : {}),
      },
      null,
      2,
    );
  }
}
