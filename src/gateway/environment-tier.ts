/**
 * environment-tier.ts - Build-time environment tier resolution
 *
 * BUILD_ENVIRONMENT_TIER is injected at compile time by scripts/build.ts via Bun's
 * define mechanism. Release builds set BUILD_ENVIRONMENT_TIER=prod in CI (.github/workflows/release.yml);
 * dev/PR builds and tests default to non-prod (bunfig.toml).
 */

import { logWarn } from '../services/logger';

declare const BUILD_ENVIRONMENT_TIER: string;

export type EnvironmentTier = 'prod' | 'pre-prod' | 'non-prod';

const VALID_TIERS: Set<string> = new Set(['prod', 'pre-prod', 'non-prod']);

/**
 * Returns the validated build-time environment tier.
 * Logs a warning and falls back to 'non-prod' if the tier is missing or unrecognized.
 */
export function getEnvironmentTier(): EnvironmentTier {
  try {
    if (VALID_TIERS.has(BUILD_ENVIRONMENT_TIER)) {
      return BUILD_ENVIRONMENT_TIER as EnvironmentTier;
    }
    logWarn(
      `[environment-tier] Unknown BUILD_ENVIRONMENT_TIER "${BUILD_ENVIRONMENT_TIER}", falling back to non-prod`,
    );
    return 'non-prod';
  } catch {
    logWarn('[environment-tier] BUILD_ENVIRONMENT_TIER not defined, falling back to non-prod');
    return 'non-prod';
  }
}

/**
 * Resolve a QNSC platform host by tier using the provided host map.
 * Falls back to the non-prod host if the resolved tier has no entry in the map.
 */
export function resolveHostByTier(hosts: Record<string, string>): string {
  const tier = getEnvironmentTier();
  const host = hosts[tier];
  if (host) return host;

  logWarn(`[environment-tier] Host map missing entry for tier "${tier}", falling back to non-prod`);
  const fallback = hosts['non-prod'];
  if (!fallback) {
    throw new Error(
      `[environment-tier] Host map has no entry for tier "${tier}" or "non-prod" fallback`,
    );
  }
  return fallback;
}
