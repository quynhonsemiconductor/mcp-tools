/**
 * update-work-item-tool.ts — change a work item that already exists.
 *
 * The other half of creating one: move it along, assign it, estimate it, mark it blocked.
 *
 * Only the fields given are sent. Rova's update schema accepts null to clear a field and
 * treats absence as "leave alone", so sending everything the caller did not mention would
 * wipe values nobody asked to change.
 */

import { z } from 'zod';
import { Tool, ToolHandler } from '../registry';
import { CatchErrors, UserError } from '../../utils';
import { rovaRequest } from './api';
import { ROVA_PRIORITIES, ROVA_SCHEDULE_STATES } from './create-work-item-tool';
import type { RovaWorkItem } from './types';

export const UpdateRovaWorkItemSchema = z.object({
  id: z.string().min(1).describe('Item id. Use getRovaWorkItem with an item key to find it.'),
  title: z.string().min(1).max(500).optional().describe('New title'),
  description: z.string().max(50_000).optional().describe('New description'),
  acceptanceCriteria: z.string().max(50_000).optional().describe('New acceptance criteria'),
  notes: z.string().max(50_000).optional().describe('New notes'),
  scheduleState: z
    .enum(ROVA_SCHEDULE_STATES)
    .optional()
    .describe('Move it along the schedule, e.g. to "in_progress" or "completed"'),
  priority: z.enum(ROVA_PRIORITIES).optional().describe('New priority'),
  storyPoints: z.number().optional().describe('New estimate in points'),
  assigneeId: z
    .string()
    .optional()
    .describe('Assign to this user id. Pass "unassign" to clear the assignee.'),
  iterationId: z
    .string()
    .optional()
    .describe('Move into this iteration. Pass "none" to take it out of an iteration.'),
  isBlocked: z.boolean().optional().describe('Mark blocked or unblocked'),
  blockedReason: z.string().max(1000).optional().describe('Why it is blocked'),
});

export type UpdateRovaWorkItemParams = z.input<typeof UpdateRovaWorkItemSchema>;

/** Words a caller uses to mean "clear this field", mapped to the null Rova expects. */
const CLEARING_WORDS = new Set(['unassign', 'none', 'null', 'clear', '']);

@Tool({
  id: 'rova-update-work-item',
  name: 'updateRovaWorkItem',
  description:
    'Update a Rova work item: change its state, priority, assignee, estimate, iteration, or mark it blocked. Only the fields given are changed. Use getRovaWorkItem first to turn an item key such as DE-17 into the id.',
  category: 'Rova',
  // Declared so the bundle offers a prompt for it at install and passes it through.
  // Without this the tools appear with no way to supply a token, and every call fails
  // on a missing variable — which is how ROVA_API_TOKEN was first shipped.
  envVars: ['ROVA_API_TOKEN'],
  optionalEnvVars: ['ROVA_API_URL'],
  parameters: UpdateRovaWorkItemSchema,
  version: '1.0.0',
  annotations: {
    title: 'Update Rova Work Item',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
})
export class UpdateRovaWorkItemTool implements ToolHandler {
  /**
   * Apply the given changes.
   *
   * @param args - Item id and the fields to change
   * @returns JSON string of what changed and the item's new state
   */
  @CatchErrors()
  async execute(args: UpdateRovaWorkItemParams): Promise<string> {
    const { id, ...changes } = UpdateRovaWorkItemSchema.parse(args);

    const patch: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(changes)) {
      if (value === undefined) continue;
      // A caller cannot send JSON null through a string field, so the clearing words
      // stand in for it. Without this there would be no way to unassign anybody.
      if (
        (field === 'assigneeId' || field === 'iterationId') &&
        typeof value === 'string' &&
        CLEARING_WORDS.has(value.toLowerCase())
      ) {
        patch[field] = null;
        continue;
      }
      patch[field] = value;
    }

    if (Object.keys(patch).length === 0) {
      throw new UserError(
        'Nothing to change. Give at least one field, such as scheduleState, assigneeId, priority or storyPoints.',
      );
    }
    // Rova stores the reason separately from the flag, so a reason on its own would be
    // recorded against an item that is not marked blocked.
    if (patch.blockedReason !== undefined && patch.isBlocked === undefined) {
      throw new UserError(
        'blockedReason needs isBlocked as well, or the reason is recorded on an item that is not marked blocked.',
      );
    }

    const updated = await rovaRequest<RovaWorkItem>(`/work-items/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });

    return JSON.stringify(
      {
        updated: true,
        itemKey: updated.itemKey,
        id: updated.id ?? id,
        changed: Object.keys(patch),
        title: updated.title,
        state: updated.scheduleState ?? updated.flowState,
        priority: updated.priority || undefined,
        storyPoints: updated.storyPoints ?? undefined,
        assignee: updated.assigneeName || undefined,
        ...(updated.isBlocked ? { blocked: updated.blockedReason || 'blocked' } : {}),
      },
      null,
      2,
    );
  }
}
