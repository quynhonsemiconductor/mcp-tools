/**
 * TLS trust store diagnostic.
 *
 * On Windows/macOS, qnsc-mcp auto-sets NODE_USE_SYSTEM_CA=1 at startup so the
 * Node/Bun TLS stack merges the OS trust store (including corp roots like
 * Zscaler that IT distributes by GPO). This check surfaces cases where that
 * didn't stick — either because a user explicitly set NODE_USE_SYSTEM_CA=0
 * or because NODE_EXTRA_CA_CERTS points at a file that no longer exists.
 *
 * Linux is a no-op: distro OpenSSL reads the system store natively.
 */

import fs from 'fs';

import { QNSCMCP_ISSUE_CODES } from '../../issue-codes';
import type { QnscMcpConfigContext, ValidationCheck, ValidationIssue } from '../../types';

export const tlsTrustStoreCheck = {
  id: 'qnscmcp.tls-trust-store',
  name: 'TLS Trust Store Check',
  description: 'Verify OS trust store integration for corporate SSL inspection',
  appliesTo: 'qnsc-mcp-config',
  priority: 18, // Run early (after architecture=10 and keyring=15) to surface TLS configuration issues before tool execution

  run(_context: QnscMcpConfigContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (process.platform === 'linux') {
      return issues;
    }

    const systemCa = process.env.NODE_USE_SYSTEM_CA;
    const extraCerts = process.env.NODE_EXTRA_CA_CERTS;

    if (extraCerts && !fs.existsSync(extraCerts)) {
      issues.push({
        severity: 'warning',
        code: QNSCMCP_ISSUE_CODES.TLS_TRUST_STORE_DISABLED,
        message: `NODE_EXTRA_CA_CERTS points to a file that does not exist: ${extraCerts}`,
        details:
          'TLS handshakes to corp-inspected hosts will fail with "unable to get local issuer certificate". ' +
          'Unset NODE_EXTRA_CA_CERTS so qnsc-mcp falls back to NODE_USE_SYSTEM_CA=1, or point it at a valid PEM bundle.',
      });
      return issues;
    }

    // If the user explicitly disabled system CA merge without providing an alternate bundle,
    // surface it — corp SSL inspection will break. Use !== undefined rather than a truthy
    // check so an explicit empty string (NODE_USE_SYSTEM_CA=) is not silently treated as a pass.
    if (systemCa !== undefined && systemCa !== '1' && !extraCerts) {
      issues.push({
        severity: 'warning',
        code: QNSCMCP_ISSUE_CODES.TLS_TRUST_STORE_DISABLED,
        message: `NODE_USE_SYSTEM_CA is set to "${systemCa}" and no NODE_EXTRA_CA_CERTS bundle is configured`,
        details:
          'On Windows/macOS, qnsc-mcp relies on OS-trusted roots for corp SSL inspection (e.g. Zscaler). ' +
          'With system CA merge disabled and no alternate bundle, TLS handshakes through an inspection ' +
          'proxy will fail. Unset NODE_USE_SYSTEM_CA to restore the default.',
      });
    }

    return issues;
  },
} satisfies ValidationCheck<QnscMcpConfigContext>;
