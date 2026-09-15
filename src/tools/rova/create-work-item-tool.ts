/**
 * create-work-item-tool.ts — file a story, defect or task in Rova.
 *
 * The write people ask for most: something is wrong, or something needs doing, and it
 * should be in the tracker without leaving the conversation.
 *
 * Type is required rather than defaulted. A defect and a story are different things with
 * different fields and different workflows, and guessing wrong produces an item somebody
 * has to find and correct later.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors } from '../../utils';
import { rovaRequest } from './api';
import type { RovaWorkItem } from './types';

/**
 * Types Rova accepts, from `work_item_type` in db/schema/enums.ts. Listed explicitly so a
 * wrong value fails here rather than as a validation error from the API.
 *
 * There is no 'feature': the schema has three types and nesting is done with parentId.
 */
export const ROVA_WORK_ITEM_TYPES = ['story', 'task', 'defect'] as const;

/** Priorities, from `work_item_priority`. Rally vocabulary; a story normally carries 'none'. */
export const ROVA_PRIORITIES = ['none', 'low', 'normal', 'high', 'urgent'] as const;

/**
 * Schedule states, from `work_item_schedule_state`. Rally's business-maturity dimension,
 * separate from the per-project workflow engine. Spelled with underscores, and the
 * terminal state is 'release' rather than 'released'.
 */
export const ROVA_SCHEDULE_STATES = [
  'idea',
  'defined',
  'in_progress',
  'completed',
  'accepted',
  'release',
] as const;

export const CreateRovaWorkItemSchema = z.object({
  projectId: z.string().min(1).describe('Project to file it in, from listRovaProjects'),
  type: z
    .enum(ROVA_WORK_ITEM_TYPES)
    .describe(
      'What is being created: story, task or defect. A defect and a story carry different fields, so this is required rather than guessed.',
    ),
  title: z.string().min(1).max(500).describe('One-line summary'),
  description: z.string().optional().describe('Detail, reproduction steps, or context'),
  acceptanceCriteria: z
    .string()
    .optional()
    .describe('What must be true for this to be done. Stories only.'),
  priority: z
    .enum(ROVA_PRIORITIES)
    .optional()
    .describe('Priority. A story normally carries "none"; defects use low through urgent.'),
  severity: z.string().optional().describe('Severity, for a defect'),
  storyPoints: z.number().optional().describe('Estimate in points, for a story'),
  assigneeId: z
    .string()
    .optional()
    .describe('User id to assign it to. Omit to leave unassigned.'),
  iterationId: z.string().optional().describe('Iteration to schedule it into'),
  parentId: z.string().optional().describe('Parent item, to nest this beneath a feature or story'),
});

export type CreateRovaWorkItemParams = z.input<typeof CreateRovaWorkItemSchema>;

@Tool({
  id: 'rova-create-work-item',
  name: 'createRovaWorkItem',
  description:
    'Create a Rova work item — a story, defect, task or feature — in a project. Needs a projectId from listRovaProjects. Returns the item key, such as DE-42, which is how people refer to it afterwards.',
  category: 'Rova',
  parameters: CreateRovaWorkItemSchema,
  version: '1.0.0',
  annotations: {
    title: 'Create Rova Work Item',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
})
export class CreateRovaWorkItemTool implements ToolHandler {
  /**
   * Create the item.
   *
   * @param args - Project, type, title and optional detail
   * @returns JSON string with the new item's key and id
   */
  @CatchErrors()
  async execute(args: CreateRovaWorkItemParams): Promise<string> {
    const parsed = CreateRovaWorkItemSchema.parse(args);

    // Only what was given is sent. Rova applies project defaults for anything absent,
    // and posting explicit nulls would overwrite those with nothing.
    const payload: Record<string, unknown> = {
      projectId: parsed.projectId,
      type: parsed.type,
      title: parsed.title,
    };
    for (const key of [
      'description',
      'acceptanceCriteria',
      'priority',
      'severity',
      'storyPoints',
      'assigneeId',
      'iterationId',
      'parentId',
    ] as const) {
      const value = parsed[key];
      if (value !== undefined) payload[key] = value;
    }

    const created = await rovaRequest<RovaWorkItem>('/work-items', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return JSON.stringify(
      {
        created: true,
        // The key is the useful half: it is what appears in conversation and in Rova's UI.
        itemKey: created.itemKey,
        id: created.id,
        type: created.type,
        title: created.title,
        state: created.scheduleState ?? created.flowState,
        project: created.projectKey || created.projectName || parsed.projectId,
      },
      null,
      2,
    );
  }
}
