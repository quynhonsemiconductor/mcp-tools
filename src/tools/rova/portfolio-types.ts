/**
 * portfolio-types.ts — epics and features, the layer above work items.
 *
 * Rova splits the hierarchy across two modules, which is why `work_item_type` has only
 * story, task and defect: epics and features are portfolio items, on their own table with
 * their own lifecycle. A story points at a feature through `featureId`.
 *
 * Their state is deliberately not a story's schedule state. The schema says why: a
 * portfolio item's lifecycle is a funnel — intake, discovery, prioritisation, developing,
 * measuring — while a story's is a delivery flow, and Rally likewise keeps them apart.
 * They also carry `name` where a work item carries `title`.
 */


/** From `portfolio_item_type`. Epics contain features; features contain stories. */
export const ROVA_PORTFOLIO_TYPES = ['epic', 'feature'] as const;

/**
 * From `portfolio_item_state`. Eleven values describing a funnel rather than a delivery
 * flow, which is why they share nothing with a work item's schedule state.
 */
export const ROVA_PORTFOLIO_STATES = [
  'no_entry',
  'intake',
  'idea_prioritization',
  'problem_discovery',
  'solution_discovery',
  'feature_prioritization',
  'developing',
  'accepted',
  'measuring',
  'done',
  'cancelled',
] as const;

/**
 * From `preliminary_estimate_size`. T-shirt sizing, Rally's PreliminaryEstimate.
 *
 * The size-to-points mapping is deliberately not encoded anywhere: it is per-project
 * configuration, so a size means whatever that project says it means.
 */
export const ROVA_ESTIMATE_SIZES = ['no_entry', 'xs', 's', 'm', 'l', 'xl'] as const;

export interface RovaPortfolioItem {
  id?: string;
  itemKey?: string;
  name?: string;
  type?: string;
  state?: string;
  description?: string | null;
  notes?: string | null;
  whatSuccessLooksLike?: string | null;
  preliminaryEstimate?: string | null;
  refinedEstimate?: number | null;
  refinedItemCountEstimate?: number | null;
  parentId?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  teamId?: string | null;
  releaseId?: string | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  projectId?: string;
  projectKey?: string;
  isArchived?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Reduce a portfolio item for a list.
 *
 * @param item - Item from the API
 * @returns The fields worth showing in a list
 */
export function summarisePortfolioItem(item: RovaPortfolioItem) {
  return {
    itemKey: item.itemKey,
    id: item.id,
    name: item.name,
    type: item.type,
    state: item.state,
    estimate: item.preliminaryEstimate || undefined,
    refinedEstimate: item.refinedEstimate ?? undefined,
    owner: item.ownerName || undefined,
    parentId: item.parentId || undefined,
    plannedEnd: item.plannedEndDate || undefined,
    ...(item.isArchived ? { archived: true } : {}),
  };
}

