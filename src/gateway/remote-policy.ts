/**
 * remote-policy.ts - Remote routing policy for local/remote tool selection
 *
 * Fetches a centralized policy from a remote endpoint at startup to determine
 * which tool categories should use remote MCP servers vs local implementations,
 * and optionally which URL a given remote server should connect to. Fail-safe:
 * if the endpoint is unreachable, all local tools remain active and every
 * server falls back to its compiled-in default URL.
 */

import { QnscMcpConfig } from '../config';
import { logDebug, logError, logInfo, logWarn } from '../services/logger';
import { ToolRegistryManager } from '../registry/tool-registry';
import type { RemoteMCPManager } from './remote-mcp-manager';
import { getEnvironmentTier } from './environment-tier';

// A suppress-list field is valid only if absent or an array of strings.
// suppressLocalTools elements become minimatch patterns via config.tools.exclude;
// a non-string element throws `invalid pattern` at registration — outside the
// per-tool try/catch — dropping the whole server into rescue mode.
const isStringArray = (v: unknown): v is string[] | undefined =>
  v === undefined || (Array.isArray(v) && v.every((e) => typeof e === 'string'));

// suppressLocalTools is exact-ID only; a glob like `*` or `sled*` would spread
// through minimatch onto unrelated local tools (exclude wins over include).
const GLOB_METACHARS = /[*?[\]{}!]/;

/**
 * Policy for a single remote server category
 */
export interface RemoteCategoryPolicy {
  /** Whether remote is preferred for this category */
  enabled: boolean;
  /** Local tool categories to suppress when remote is active */
  suppressLocalCategories?: string[];
  /**
   * Individual local tool IDs to suppress when remote is active. Finer-grained
   * than suppressLocalCategories: lets a single tool go remote-first without
   * splitting it out of a shared local category. Applied via
   * config.tools.exclude, which shouldIncludeTool() honors before categories.
   */
  suppressLocalTools?: string[];
  /** Client names that should use remote (e.g., ["vscode", "claude-code"]) */
  clients?: string[];
  /**
   * Optional connection URL override for this server, e.g. to redirect it at
   * a different gateway/cluster without an mcp-tools code change or release.
   * Only applied when `enabled` is true and the URL passes `isValidPolicyUrl`.
   * A local `{SERVICE}_MCP_URL` env var always takes precedence over this —
   * see `resolveRemoteServerUrl`.
   */
  url?: string;
}

/**
 * Full remote routing policy
 */
export interface RemotePolicy {
  /** Schema version */
  version: number;
  /** Per-server-id policies */
  policies: Record<string, RemoteCategoryPolicy>;
}

/** Empty policy used as fail-safe default */
export const EMPTY_POLICY: Readonly<RemotePolicy> = Object.freeze({
  version: 1,
  policies: Object.freeze({}),
});

/** Policy endpoint hosts by environment tier */
const POLICY_HOSTS: Record<string, string> = {
  prod: 'policy.mcp-prod.ai.qnsc.vn',
  'pre-prod': 'policy.mcp-pp.ai.qnsc.vn',
  'non-prod': 'policy.mcp-np.ai.qnsc.vn',
};

/**
 * Resolve the policy URL from (in priority order):
 * 1. Explicit policyUrl parameter (for testing)
 * 2. Explicit tier parameter mapped through POLICY_HOSTS (for testing)
 * 3. BUILD_ENVIRONMENT_TIER compile-time constant mapped through POLICY_HOSTS
 *
 * If no URL can be resolved, returns undefined and logs a warning.
 */
export function resolvePolicyUrl(policyUrl?: string, tier?: string): string | undefined {
  if (policyUrl) return policyUrl;

  const resolvedTier = tier || getEnvironmentTier();
  const host = POLICY_HOSTS[resolvedTier];
  if (!host) {
    // Only reachable when an explicit tier param is passed (testing); getEnvironmentTier()
    // always returns a valid key that exists in POLICY_HOSTS.
    logWarn(`[remote-policy] Unknown policy tier "${resolvedTier}", no policy URL available`);
    return undefined;
  }
  return `https://${host}/config`;
}

/**
 * Fetch the remote routing policy from the centralized endpoint.
 * Returns EMPTY_POLICY on any failure (network, timeout, parse error, no URL).
 */
export async function fetchRemotePolicy(
  timeoutMs: number = 2000,
  policyUrl?: string,
): Promise<RemotePolicy> {
  const url = resolvePolicyUrl(policyUrl);
  if (!url) {
    logWarn('[remote-policy] No policy URL configured, using defaults');
    return EMPTY_POLICY;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timer);

    if (!res.ok) {
      logWarn(`[remote-policy] Policy endpoint returned ${res.status}, using defaults`);
      return EMPTY_POLICY;
    }

    const data: unknown = await res.json();

    if (
      !data ||
      typeof data !== 'object' ||
      typeof (data as { version?: unknown }).version !== 'number' ||
      !(data as { policies?: unknown }).policies
    ) {
      logWarn('[remote-policy] Invalid policy format, using defaults');
      return EMPTY_POLICY;
    }

    // Shape validated above (version is a number, policies is truthy); safe to
    // treat as RemotePolicy from here on.
    const parsed = data as RemotePolicy;

    if (parsed.version !== 1) {
      logWarn(`[remote-policy] Unsupported policy version ${parsed.version}, using defaults`);
      return EMPTY_POLICY;
    }

    logDebug(
      `[remote-policy] Fetched policy v${parsed.version} with ${Object.keys(parsed.policies).length} entries`,
    );
    return parsed;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (error instanceof Error && error.name === 'AbortError') {
      logWarn(`[remote-policy] Policy fetch timed out after ${timeoutMs}ms, using defaults`);
    } else if (error instanceof SyntaxError) {
      logWarn(`[remote-policy] Policy endpoint returned invalid JSON: ${msg}, using defaults`);
    } else if (error instanceof TypeError) {
      logWarn(
        `[remote-policy] Network error fetching policy from "${url}": ${msg}, using defaults`,
      );
    } else {
      logError(`[remote-policy] Policy fetch failed unexpectedly: ${msg}, using defaults`);
    }
    return EMPTY_POLICY;
  }
}

/** Domain suffixes a policy-supplied `url` override is allowed to target. */
const ALLOWED_POLICY_URL_SUFFIXES = ['qnsc.vn'];

/**
 * Validates a policy-supplied URL override before it's used to redirect a
 * remote MCP server's connection. Unlike `enabled` (a harmless boolean), a
 * `url` override can redirect where OAuth tokens and credentials get sent,
 * so it's held to a stricter https + domain-allowlist bar than most existing
 * `{SERVICE}_MCP_URL` env var overrides in available-remote-servers.ts —
 * only `smartsheet`'s (via `getExternalMcpUrl` with `allowedHostSuffixes`)
 * matches this exactly; `splunk`/`k6` (via `getPlatformMcpUrl`) and `kong`
 * apply no validation at all, and `postman`/`stripe` check https but not
 * domain.
 */
export function isValidPolicyUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  return ALLOWED_POLICY_URL_SUFFIXES.some(
    (suffix) => parsed.hostname === suffix || parsed.hostname.endsWith(`.${suffix}`),
  );
}

/**
 * Servers whose env var override name doesn't follow the standard
 * `${ID}_MCP_URL` derivation below — keep in sync with
 * available-remote-servers.ts. Currently empty: the one server that needed an
 * override was removed. Add an entry whenever a server's documented env var
 * differs from the derived name, or a policy url override would silently beat
 * it and break the "env var always wins" guarantee documented below.
 */
const ENV_VAR_NAME_OVERRIDES: Record<string, string> = {};

/**
 * Resolve the connection URL for a remote MCP server, applying a policy-driven
 * host override when present, valid, and enabled — unless a local
 * `{SERVICE}_MCP_URL` env var is set, which always wins (an individual
 * developer's explicit override should never be silently superseded by a
 * cluster-wide policy).
 *
 * @param serverId - The server's id (e.g. 'aws-knowledge-mcp-server'), used to derive the env
 *   var name (see ENV_VAR_NAME_OVERRIDES for exceptions) and to look up the
 *   policy entry.
 * @param defaultUrl - The server's compiled-in URL. **Must already reflect
 *   any `{SERVICE}_MCP_URL` env var** — callers are responsible for
 *   resolving env vars before calling this (see `available-remote-servers.ts`
 *   / `getPlatformMcpUrl`). Returned unchanged if no valid policy override
 *   applies.
 */
export function resolveRemoteServerUrl(
  serverId: string,
  defaultUrl: string,
  policy?: RemotePolicy,
): string {
  const envVarName =
    ENV_VAR_NAME_OVERRIDES[serverId] || `${serverId.toUpperCase().replace(/-/g, '_')}_MCP_URL`;
  if (process.env[envVarName]) {
    return defaultUrl;
  }

  const categoryPolicy = policy?.policies?.[serverId];
  // policy is fetched from untyped JSON over the network — `url` could be
  // any JSON type, not just a string (e.g. a number or object from a typo
  // in the policy document). typeof-check it here rather than relying on
  // isValidPolicyUrl alone: that function correctly returns false for a
  // non-string (new URL() throws, caught internally), but the warn-path
  // logging below calls .replace() directly on categoryPolicy.url, which
  // would throw on a non-string before ever reaching that safe "false" path.
  if (categoryPolicy?.enabled && typeof categoryPolicy.url === 'string' && categoryPolicy.url) {
    if (isValidPolicyUrl(categoryPolicy.url)) {
      // Log the parsed/normalized href, not the raw string: the WHATWG URL
      // parser strips \n\r\t from the entire input before parsing, so a raw
      // string like "https://valid.host/mcp\n[FORGED LOG LINE]" can pass
      // isValidPolicyUrl's hostname check while still containing a literal
      // newline — logging it verbatim would inject a forged line into the
      // log file.
      const normalizedUrl = new URL(categoryPolicy.url).href;
      logInfo(`[remote-policy] ${serverId}: using policy-driven host override: ${normalizedUrl}`);
      return normalizedUrl;
    }
    // isValidPolicyUrl() only returns a boolean — it discards its parsed URL
    // (and for some invalid inputs, `new URL()` throws outright) — so there's
    // no parsed object here to reuse. Strip control characters (including
    // line/paragraph separators, not just \r\n\t) and cap the length before
    // logging the raw policy value (see the comment above for why raw
    // interpolation is unsafe).
    // Intentional: strips control chars (including line/paragraph separators)
    // from an untrusted policy value before logging it, to prevent log
    // injection (see comment above).
    // eslint-disable-next-line no-control-regex -- see comment above
    const safeUrl = categoryPolicy.url.replace(/[\x00-\x1f\x7f\u2028\u2029]/g, ' ').slice(0, 200);
    logWarn(
      `[remote-policy] ${serverId}: policy url "${safeUrl}" failed validation ` +
        `(must be https:// and end in an allowed domain), ignoring override`,
    );
  }

  return defaultUrl;
}

/**
 * Determine if the current instance should use remote tools for a given policy
 * based on client filter. If no clients are specified, the policy applies to all.
 */
export function shouldApplyPolicy(policy: RemoteCategoryPolicy, clientHint?: string): boolean {
  if (!policy.enabled) return false;

  // If clients are specified, only apply if the current client matches
  if (policy.clients && policy.clients.length > 0) {
    if (!clientHint) return false; // Can't confirm client matches, don't suppress
    const normalizedHint = clientHint.toLowerCase();
    return policy.clients.some((c) => typeof c === 'string' && normalizedHint === c.toLowerCase());
  }

  return true;
}

/**
 * Apply the remote routing policy to suppress local tool categories
 * where a remote server is preferred and successfully connected.
 *
 * This is the main entry point called from server.ts after remote MCP
 * servers are initialized.
 *
 * Suppression is applied at two granularities: whole local categories
 * (suppressLocalCategories) and individual local tool IDs (suppressLocalTools),
 * the latter for a single tool that shares a broad category with unrelated
 * tools.
 *
 * Gates: local tools are only suppressed when ALL of:
 * 1. The remote server actually connected successfully
 * 2. The server is in the user's includeRemoteMCPs config
 * 3. The policy entry is enabled
 * 4. The client filter matches this instance, if one is specified
 */
export function applyRemotePolicy(
  config: QnscMcpConfig,
  remoteMCPManager: RemoteMCPManager,
  registry: ToolRegistryManager,
  policy: RemotePolicy,
  clientHint?: string,
): string[] {
  // `policy` is fetched from untyped JSON over the network — the TypeScript
  // shape isn't a runtime guarantee (same reasoning as resolveRemoteServerUrl's
  // `policy?.policies?.[serverId]` guard). A malformed/missing `policies` key
  // must degrade to "no policies defined", not throw.
  const policies = policy?.policies;
  if (!policies || Object.keys(policies).length === 0) {
    logDebug('[remote-policy] No policies defined, all local tools remain active');
    return [];
  }

  const connectionStatus = remoteMCPManager.getConnectionStatus();
  const includedRemoteMCPs = config.tools?.includeRemoteMCPs || [];
  const suppressedCategories: string[] = [];
  const suppressedTools: string[] = [];

  for (const [serverId, categoryPolicy] of Object.entries(policies)) {
    // Validate entry shape before processing. `clients`, if present, must be
    // an array — a policy author typo like `clients: "vscode"` (a bare
    // string instead of `["vscode"]`) would otherwise pass this far (strings
    // have `.length`) and only fail later inside shouldApplyPolicy's
    // `.some()` call, which strings don't have.
    if (
      !categoryPolicy ||
      typeof categoryPolicy.enabled !== 'boolean' ||
      !isStringArray(categoryPolicy.suppressLocalCategories) ||
      !isStringArray(categoryPolicy.suppressLocalTools) ||
      (categoryPolicy.clients !== undefined && !Array.isArray(categoryPolicy.clients))
    ) {
      logWarn(`[remote-policy] Skipping ${serverId}: invalid policy entry format`);
      continue;
    }

    // The gates below are wrapped per-entry: policy is fetched from untyped
    // JSON over the network, so an unanticipated shape could still throw
    // somewhere the shape guard above doesn't cover. Without this boundary,
    // one bad entry would abort the whole loop via the uncaught exception —
    // discarding every other (valid, already-decided) server's suppression
    // too, not just the bad entry's — the same fail-safe reasoning as
    // RemoteMCPManager's per-server try/catch around resolveRemoteServerUrl.
    try {
      // Gate 1: Is the remote server actually connected?
      if (!(serverId in connectionStatus)) {
        logDebug(`[remote-policy] Skipping ${serverId}: no such remote MCP server configured`);
        continue;
      }
      if (connectionStatus[serverId] !== 'connected') {
        logDebug(
          `[remote-policy] Skipping ${serverId}: not connected (status: ${connectionStatus[serverId]})`,
        );
        continue;
      }

      // Gate 2: Is the server in the user's includeRemoteMCPs?
      if (!includedRemoteMCPs.includes(serverId)) {
        logDebug(`[remote-policy] Skipping ${serverId}: not in includeRemoteMCPs`);
        continue;
      }

      // Gate 3: Is the policy entry enabled? Gate 4: Does the client filter
      // include this instance? shouldApplyPolicy() checks both as one boolean —
      // check `enabled` separately here too, only to log which one actually
      // failed (live testing found the generic "not in client filter" message
      // firing even when the real reason was a disabled policy entry).
      if (!shouldApplyPolicy(categoryPolicy, clientHint)) {
        if (!categoryPolicy.enabled) {
          logDebug(`[remote-policy] Skipping ${serverId}: policy entry disabled`);
        } else {
          logDebug(`[remote-policy] ${serverId}: not in client filter`);
        }
        continue;
      }

      // All gates passed: suppress local categories and/or individual tool IDs
      const categories = categoryPolicy.suppressLocalCategories;
      if (categories && categories.length > 0) {
        suppressedCategories.push(...categories);
        logInfo(
          `[remote-policy] ${serverId}: suppressing local categories [${categories.join(', ')}] in favor of remote`,
        );
      }
      const tools = categoryPolicy.suppressLocalTools?.filter((t) => {
        if (GLOB_METACHARS.test(t)) {
          logWarn(
            `[remote-policy] ${serverId}: ignoring suppressLocalTools entry "${t}" — only exact tool IDs are allowed, not glob patterns`,
          );
          return false;
        }
        return true;
      });
      if (tools && tools.length > 0) {
        suppressedTools.push(...tools);
        logInfo(
          `[remote-policy] ${serverId}: suppressing local tools [${tools.join(', ')}] in favor of remote`,
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logError(
        `[remote-policy] Skipping ${serverId}: unexpected error while evaluating policy entry: ${msg}`,
      );
      continue;
    }
  }

  // Apply suppressions to the registry. (A previous version of this function
  // also called registry.addIncludedCategories(['Remote']) when a suppressed
  // category overlapped an active includeCategories filter, intending to let
  // remote replacement tools bypass that filter — removed as dead code:
  // remote tools are unconditionally includeByDefault: true in
  // createRemoteToolConfig, so shouldIncludeTool()'s fallback already
  // includes them regardless of includeCategories. Verified live: disabling
  // the call changed nothing observable in tools/list.)
  if (suppressedCategories.length > 0) {
    registry.addExcludedCategories(suppressedCategories);
  }
  if (suppressedTools.length > 0) {
    registry.addExcludedTools(suppressedTools);
  }

  return suppressedCategories;
}
