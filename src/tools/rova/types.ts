/**
 * types.ts — the parts of a Rova work item worth returning.
 *
 * A work item carries 43 fields. Returning all of them for a list of fifty would flood
 * the context with things nobody asked about — custom fields, rank, workspace id, six
 * separate audit columns — so lists return a summary and only a direct read returns
 * everything.
 */

/** A work item as Rova returns it. Every field is optional: shape varies by type. */
export interface RovaWorkItem {
  id?: string;
  itemKey?: string;
  title?: string;
  type?: string;
  scheduleState?: string;
  flowState?: string;
  priority?: string;
  severity?: string;
  storyPoints?: number | null;
  estimateHours?: number | null;
  actualHours?: number | null;
  todoHours?: number | null;
  isBlocked?: boolean;
  blockedReason?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  devOwnerName?: string | null;
  projectId?: string;
  projectKey?: string;
  projectName?: string;
  iterationId?: string | null;
  releaseId?: string | null;
  parentId?: string | null;
  description?: string | null;
  acceptanceCriteria?: string | null;
  notes?: string | null;
  resolution?: string | null;
  rootCause?: string | null;
  defectState?: string | null;
  foundInEnvironment?: string | null;
  fixedInBuild?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** The fields a list returns: enough to identify an item and decide whether to open it. */
export interface RovaWorkItemSummary {
  itemKey?: string;
  id?: string;
  title?: string;
  type?: string;
  state?: string;
  priority?: string;
  severity?: string;
  points?: number | null;
  assignee?: string | null;
  blocked?: string | null;
  project?: string;
}

/**
 * Reduce a work item to its summary.
 *
 * `scheduleState` is reported as `state` because that is what it is called everywhere in
 * Rova's own interface, and `flowState` is used when an item has no schedule state.
 *
 * @param item - A work item from the API
 * @returns The summary fields, with empty ones dropped
 */
export function summariseWorkItem(item: RovaWorkItem): RovaWorkItemSummary {
  return {
    itemKey: item.itemKey,
    id: item.id,
    title: item.title,
    type: item.type,
    state: item.scheduleState ?? item.flowState ?? undefined,
    priority: item.priority || undefined,
    severity: item.severity || undefined,
    points: item.storyPoints ?? undefined,
    assignee: item.assigneeName || undefined,
    // Only present when true: a blocked item is the exception and worth surfacing, and
    // "isBlocked: false" on every row is noise.
    blocked: item.isBlocked ? (item.blockedReason || 'blocked') : undefined,
    project: item.projectKey || item.projectName || undefined,
  };
}
