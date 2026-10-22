/**
 * Insiders feature gating utility.
 *
 * Provides a single check for whether the user has opted in to insiders/preview
 * features. This gates pre-GA functionality (like Entra ID SSO) so it can be
 * tested by a smaller group before rolling out to everyone.
 *
 * Users opt in by setting `insiders: true` in their `.qnscmcp.yaml` config file,
 * or via the environment variable `QNSC_MCP_CONFIG__INSIDERS=true`.
 */

import type { QnscMcpConfig } from '../config';

/**
 * Check whether insiders mode is enabled.
 *
 * @param config - The loaded qnscmcp configuration
 * @returns true if the user has opted in to insiders features
 */
export function isInsidersEnabled(config: QnscMcpConfig): boolean {
  return config.insiders === true;
}
