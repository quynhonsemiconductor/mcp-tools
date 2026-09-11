/**
 * Build-time constants for telemetry
 */

/**
 * New Relic region for OTLP endpoint selection.
 * Shared type used by both env.ts and telemetry service to ensure consistency.
 */
export type NewRelicRegion = (typeof NewRelicRegions)[number];
export const NewRelicRegions = ['US', 'EU', 'EU2'] as const;
