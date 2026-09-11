/**
 * Architecture validation check for QNSC-MCP
 *
 * Detects architecture mismatches between the binary and system architecture,
 * particularly when running x64 binaries on Apple Silicon via Rosetta.
 */

import type { QnscMcpConfigContext, ValidationCheck, ValidationIssue } from '../../types';
import { QNSCMCP_ISSUE_CODES } from '../../issue-codes';
import { detectArchitecture, getRecommendedBinaryName } from '../../../../utils/architecture';

export const architectureCheck: ValidationCheck<QnscMcpConfigContext> = {
  id: 'qnscmcp.architecture',
  name: 'Binary Architecture Check',
  description: 'Check if binary architecture matches system architecture for optimal performance',
  appliesTo: 'qnsc-mcp-config',
  priority: 10, // Run early since this is a system-level check

  // eslint-disable-next-line @typescript-eslint/require-await -- implements a Promise-returning interface; async is required by the contract even without an await
  async run(_context: QnscMcpConfigContext): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    try {
      const archInfo = detectArchitecture();

      if (archInfo.isMismatch) {
        const recommendedBinary = getRecommendedBinaryName(archInfo);

        if (archInfo.isX64OnAppleSilicon) {
          // Specific case: x64 on Apple Silicon
          issues.push({
            severity: 'warning',
            code: QNSCMCP_ISSUE_CODES.X64_ON_APPLE_SILICON,
            message: 'Running Intel (x64) binary on Apple Silicon',
            details: `You are using the x64 binary on Apple Silicon. For better performance and to avoid Rosetta compatibility issues, use ${recommendedBinary} instead. This can resolve issues like OAuth failures and improve overall performance.`,
          });
        } else {
          // General architecture mismatch
          issues.push({
            severity: 'warning',
            code: QNSCMCP_ISSUE_CODES.ARCHITECTURE_MISMATCH,
            message: 'Binary architecture does not match system architecture',
            details: `Binary: ${archInfo.processArch}, System: ${archInfo.systemArch}. For optimal performance, use ${recommendedBinary}.`,
          });
        }
      }
    } catch {
      // Don't fail the whole validation if architecture detection fails
      // This is a nice-to-have check, not critical
    }

    return issues;
  },
};
