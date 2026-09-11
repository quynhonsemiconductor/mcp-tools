/**
 * Keyring health validation check for QNSC-MCP
 *
 * Detects keyring corruption issues that can cause OAuth token storage failures
 * and password prompt loops, particularly after version upgrades.
 */

import type { QnscMcpConfigContext, ValidationCheck, ValidationIssue } from '../../types';
import { QNSCMCP_ISSUE_CODES } from '../../issue-codes';
import { getRecoveryInstructions, isKeyringAvailable } from '../../../auth/keyring-loader';
import { KeyringCorruptionError, TokenStore } from '../../../auth/token-store';
import { logDebug } from '../../../logger';

/**
 * Check keyring health for all known services.
 * This helps detect corruption issues before they cause problems.
 */
export const keyringHealthCheck: ValidationCheck<QnscMcpConfigContext> = {
  id: 'qnscmcp.keyring-health',
  name: 'Keyring Health Check',
  description: 'Check credential storage health for OAuth token persistence',
  appliesTo: 'qnsc-mcp-config',
  priority: 15, // Run early to detect storage issues

  async run(_context: QnscMcpConfigContext): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    try {
      // First check if keyring is available at all
      const available = isKeyringAvailable();

      if (!available) {
        issues.push({
          severity: 'info',
          code: QNSCMCP_ISSUE_CODES.KEYRING_UNAVAILABLE,
          message: 'OS credential storage (keyring) is not available',
          details:
            'OAuth tokens will not be persisted between sessions. ' +
            'Consider setting tokens via environment variables for persistent authentication. ' +
            'This is normal in some environments (Docker containers, CI/CD systems, etc.).',
        });
        return issues;
      }

      // Check health of known service keystores
      const services = [
        { name: 'GitHub', serviceKey: 'qnsc-mcp-github' },
        { name: 'Slack', serviceKey: 'qnsc-mcp-slack' },
      ];

      for (const { name, serviceKey } of services) {
        try {
          const store = new TokenStore(serviceKey);
          await store.initialize({ readOnly: true });
          const health = await store.getKeyringHealth();

          if (health.failureCount > 0) {
            const platform = process.platform;
            const instructions = getRecoveryInstructions(serviceKey, platform);

            issues.push({
              severity: 'warning',
              code: QNSCMCP_ISSUE_CODES.KEYRING_CORRUPTION,
              message: `${name} keyring has experienced failures (count: ${health.failureCount})`,
              details:
                `This may indicate corrupted or stale credential entries, often caused by version upgrades. ` +
                `Last error: ${health.lastError || 'unknown'}.\n\n` +
                `To fix, delete the corrupted entries:\n${instructions}\n\n` +
                `You will need to re-authenticate after deletion.`,
            });
          }
        } catch (error) {
          // Error during health check - likely indicates corruption
          if (error instanceof KeyringCorruptionError) {
            issues.push({
              severity: 'error',
              code: QNSCMCP_ISSUE_CODES.KEYRING_CORRUPTION,
              message: `${name} keyring is corrupted`,
              details:
                `Detected keyring corruption for ${name} service. ` +
                String(error) +
                '\n\nAuto-recovery may have been attempted. If issues persist, see instructions above.',
            });
          }
        }
      }
    } catch (error) {
      // Don't fail the whole validation if keyring health check fails
      // This is diagnostic information, not critical to config validation
      logDebug(
        `Keyring health check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return issues;
  },
};
