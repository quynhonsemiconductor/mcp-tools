import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Octokit } from 'octokit';
import { GH_API_URL } from '../tools/github';
import { logDebug, logError, logInfo } from '../services/logger';
import { getAuthToken } from './update-check';
import { getGitHubTokenManager } from '../tools/github/auth/token-manager';
import { getPlatformInfo } from './update-platform';

/**
 * Narrow an unknown catch value to a readable message. Mirrors the
 * `error instanceof Error ? error.message : String(error)` convention used
 * elsewhere in this codebase (e.g. src/utils/update-utils.ts).
 */
const errMsg = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Octokit rejects failed REST calls with an error carrying a numeric HTTP
 * `status` (see @octokit/request-error). Read it through a narrow guard rather
 * than `any`; returns undefined for non-HTTP errors.
 */
const errStatus = (error: unknown): number | undefined =>
  typeof error === 'object' &&
  error !== null &&
  'status' in error &&
  typeof (error as { status: unknown }).status === 'number'
    ? (error as { status: number }).status
    : undefined;

const REPO_INFO = {
  owner: 'quynhonsemiconductor',
  repo: 'mcp-tools',
};

const WORKFLOW_FILE = 'pr-binaries.yml';

/**
 * Info about a resolved PR artifact that is ready to install.
 */
export interface PRArtifactInfo {
  artifactId: number;
  artifactName: string;
  prNumber: number;
  runId: number;
  headSha: string;
  authToken: string;
  /** Set when falling back to a non-successful run conclusion */
  warning?: string;
}

/**
 * Result when the latest CI is still building.
 */
export interface PRArtifactPending {
  ciInProgress: true;
  latestSha: string;
  /** A previous successful build that can be installed while waiting */
  previousRun?: PRArtifactInfo;
}

export type PRArtifactResult = PRArtifactInfo | PRArtifactPending;

/**
 * Parse a PR target string like "pr899" or "PR123" into a PR number.
 * Returns null for invalid input.
 */
export const parsePRTarget = (target: string): number | null => {
  const match = target.match(/^pr(\d+)$/i);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  if (num <= 0) return null;
  return num;
};

/** True for HTTP 401/403 — a token that is missing, expired, or lacks access. */
const isAuthError = (error: unknown): boolean => {
  const status = errStatus(error);
  return status === 401 || status === 403;
};

/**
 * Auth tokens to try for a GitHub API call, in order: the quick token first
 * (embedded RELEASES_TOKEN / GITHUB_TOKEN env var), then the keyring OAuth token.
 *
 * Callers try each in turn, moving to the next when one is rejected with 401/403.
 * This lets install recover from an *expired* embedded token by falling back to a
 * valid keyring token — the same recovery checkForUpdates already does for update.
 * (The previous single-token resolver only fell back when the quick token was
 * absent, never when it was present-but-rejected.)
 */
const candidateAuthTokens = async (): Promise<string[]> => {
  const tokens: string[] = [];
  const quickToken = getAuthToken();
  if (quickToken) tokens.push(quickToken);

  try {
    const oauthToken = await getGitHubTokenManager().getToken({ interactive: false });
    if (oauthToken && oauthToken !== quickToken) tokens.push(oauthToken);
  } catch (error: unknown) {
    logDebug('OAuth token lookup failed during release/PR resolution', { error: errMsg(error) });
  }

  return tokens;
};

/**
 * Info about a resolved release artifact that is ready to install.
 */
export interface ReleaseArtifactInfo {
  assetId: number;
  owner: string;
  repo: string;
  version: string;
  authToken: string;
}

export type ReleaseArtifactError =
  | 'no_auth'
  | 'forbidden'
  | 'not_found'
  | 'no_platform_asset'
  | 'api_error';

/**
 * Fetch a specific release by version tag and resolve the platform asset.
 * Version should be without leading "v" (e.g. "1.2.3").
 *
 * Tries each candidate token in order (see candidateAuthTokens); a token rejected
 * with 401/403 falls through to the next, so an expired embedded token doesn't
 * fail the install when a valid keyring token is available.
 */
export const fetchReleaseByVersion = async (
  version: string,
): Promise<ReleaseArtifactInfo | { error: ReleaseArtifactError }> => {
  const tokens = await candidateAuthTokens();
  if (tokens.length === 0) {
    return { error: 'no_auth' };
  }

  let lastAuthError: unknown;

  for (const authToken of tokens) {
    const octokit = new Octokit({ auth: authToken, baseUrl: GH_API_URL });

    try {
      const { data: release } = await octokit.rest.repos.getReleaseByTag({
        ...REPO_INFO,
        tag: `v${version}`,
      });

      const { binaryName } = getPlatformInfo();
      const asset = release.assets.find((a) => a.name === binaryName);
      if (!asset) {
        logDebug('No platform asset found for version', {
          version,
          binaryName,
          available: release.assets.map((a) => a.name),
        });
        return { error: 'no_platform_asset' };
      }

      return {
        assetId: asset.id,
        owner: REPO_INFO.owner,
        repo: REPO_INFO.repo,
        version,
        authToken,
      };
    } catch (error: unknown) {
      if (errStatus(error) === 404) {
        return { error: 'not_found' };
      }
      if (isAuthError(error)) {
        // Token rejected — remember it and try the next candidate.
        lastAuthError = error;
        continue;
      }
      logError('Failed to fetch release by version', {
        version,
        status: errStatus(error),
        error: errMsg(error),
      });
      return { error: 'api_error' };
    }
  }

  // Every candidate token was rejected with 401/403. A 403 is not necessarily an
  // auth problem (rate limiting, insufficient scopes, org IP allow-list), so keep
  // it distinct from a plain missing/expired token and log the status.
  if (errStatus(lastAuthError) === 403) {
    logError('Forbidden fetching release by version', { version, status: 403 });
    return { error: 'forbidden' };
  }
  return { error: 'no_auth' };
};

/**
 * Resolve the artifact info for a given PR number.
 * Finds the appropriate workflow run and platform-matching artifact.
 */
export const resolvePRArtifact = async (prNumber: number): Promise<PRArtifactResult> => {
  const tokens = await candidateAuthTokens();
  if (tokens.length === 0) {
    throw new PRResolutionError(
      'No authentication token available. Set GITHUB_TOKEN or use a GitHub tool in Claude to trigger authentication.',
      'no_auth',
    );
  }

  // 1. Verify PR exists and get head SHA. This is the first authenticated call,
  // so use it to pick a working token: try each candidate, skipping any rejected
  // with 401/403, then reuse that token/client for the rest of the resolution.
  let octokit: Octokit | undefined;
  let authToken = '';
  let headSha = '';
  let headBranch = '';

  for (const candidate of tokens) {
    const client = new Octokit({ auth: candidate, baseUrl: GH_API_URL });
    try {
      const { data: pr } = await client.rest.pulls.get({
        ...REPO_INFO,
        pull_number: prNumber,
      });
      octokit = client;
      authToken = candidate;
      headSha = pr.head.sha;
      headBranch = pr.head.ref;
      logDebug('PR resolved', { prNumber, headSha: headSha.slice(0, 7), headBranch });
      break;
    } catch (error: unknown) {
      if (errStatus(error) === 404) {
        throw new PRResolutionError(
          `PR #${prNumber} not found. Check the PR number and try again.`,
          'pr_not_found',
        );
      }
      if (isAuthError(error)) {
        // Token rejected — try the next candidate.
        continue;
      }
      throw new PRResolutionError(`Failed to fetch PR #${prNumber}: ${errMsg(error)}`, 'api_error');
    }
  }

  if (!octokit) {
    // Every candidate token was rejected with 401/403.
    throw new PRResolutionError(
      'No authentication token available. Set GITHUB_TOKEN or use a GitHub tool in Claude to trigger authentication.',
      'no_auth',
    );
  }

  // 2. Find workflow runs for this PR's head SHA
  const { binaryName } = getPlatformInfo();

  // Try to find a successful run for the latest commit
  let targetRun: { id: number; conclusion: string | null; head_sha: string } | undefined;

  try {
    const { data: runsForSha } = await octokit.rest.actions.listWorkflowRuns({
      ...REPO_INFO,
      workflow_id: WORKFLOW_FILE,
      head_sha: headSha,
      per_page: 10,
    });

    // Look for a successful run first
    const successfulRun = runsForSha.workflow_runs.find((r) => r.conclusion === 'success');

    if (successfulRun) {
      targetRun = {
        id: successfulRun.id,
        conclusion: successfulRun.conclusion,
        head_sha: successfulRun.head_sha,
      };
    } else {
      // Check if there are in-progress/queued runs for the latest SHA
      const pendingRun = runsForSha.workflow_runs.find(
        (r) => r.status === 'in_progress' || r.status === 'queued',
      );

      if (pendingRun) {
        // CI is still building for the latest commit — look for a previous successful build
        logInfo('CI is in progress for latest SHA, checking for previous successful builds', {
          latestSha: headSha.slice(0, 7),
        });

        const previousRun = await findPreviousSuccessfulRun(
          octokit,
          headBranch,
          headSha,
          binaryName,
          authToken,
          prNumber,
        );

        return {
          ciInProgress: true,
          latestSha: headSha,
          previousRun: previousRun ?? undefined,
        } satisfies PRArtifactPending;
      }

      // No in-progress runs — fall back to most recent completed run for this SHA
      const completedRun = runsForSha.workflow_runs.find((r) => r.status === 'completed');

      if (completedRun) {
        targetRun = {
          id: completedRun.id,
          conclusion: completedRun.conclusion,
          head_sha: completedRun.head_sha,
        };
      }
    }
  } catch (error: unknown) {
    throw new PRResolutionError(`Failed to list workflow runs: ${errMsg(error)}`, 'api_error');
  }

  // If no runs found for the latest SHA, try finding any successful run on the branch
  if (!targetRun) {
    const fallbackRun = await findPreviousSuccessfulRun(
      octokit,
      headBranch,
      headSha,
      binaryName,
      authToken,
      prNumber,
    );
    if (fallbackRun) {
      return fallbackRun;
    }

    throw new PRResolutionError(
      `No workflow runs found for PR #${prNumber}. The CI workflow may not have run yet.\n` +
        `Check the Actions tab: ${GH_API_URL.replace('/api/v3', '')}/${REPO_INFO.owner}/${REPO_INFO.repo}/actions`,
      'no_runs',
    );
  }

  // 3. Get artifacts for the target run
  return await resolveArtifactFromRun(octokit, targetRun, prNumber, binaryName, authToken);
};

/**
 * Find the most recent successful run on the PR branch (checks up to 5 recent runs).
 */
const findPreviousSuccessfulRun = async (
  octokit: InstanceType<typeof Octokit>,
  headBranch: string,
  excludeSha: string,
  binaryName: string,
  authToken: string,
  prNumber: number,
): Promise<PRArtifactInfo | null> => {
  try {
    const { data: branchRuns } = await octokit.rest.actions.listWorkflowRuns({
      ...REPO_INFO,
      workflow_id: WORKFLOW_FILE,
      branch: headBranch,
      // The workflow-run "status" query filter also accepts conclusion values
      // like "success" at the API level, but Octokit's generated param type is
      // narrower. Assert to the exact param type instead of `any`.
      status: 'success' as NonNullable<
        Parameters<typeof octokit.rest.actions.listWorkflowRuns>[0]
      >['status'],
      per_page: 5,
    });

    // Find a successful run that isn't the current SHA (which we already know has no success)
    const previousRun = branchRuns.workflow_runs.find(
      (r) => r.head_sha !== excludeSha && r.conclusion === 'success',
    );

    if (!previousRun) return null;

    // Verify this run has the artifact we need
    return await resolveArtifactFromRun(
      octokit,
      { id: previousRun.id, conclusion: previousRun.conclusion, head_sha: previousRun.head_sha },
      prNumber,
      binaryName,
      authToken,
    );
  } catch (error: unknown) {
    logDebug('Failed to find previous successful run', {
      branch: headBranch,
      error: errMsg(error),
    });
    return null;
  }
};

/**
 * Given a specific workflow run, resolve the platform artifact from it.
 */
const resolveArtifactFromRun = async (
  octokit: InstanceType<typeof Octokit>,
  run: { id: number; conclusion: string | null; head_sha: string },
  prNumber: number,
  binaryName: string,
  authToken: string,
): Promise<PRArtifactInfo> => {
  const { data: artifactsData } = await octokit.rest.actions.listWorkflowRunArtifacts({
    ...REPO_INFO,
    run_id: run.id,
  });

  const artifact = artifactsData.artifacts.find((a) => a.name === binaryName);

  if (!artifact) {
    const available = artifactsData.artifacts.map((a) => a.name).join(', ');
    throw new PRResolutionError(
      `No artifact found for your platform (${binaryName}).\n` +
        `Available artifacts: ${available || 'none'}`,
      'no_platform_artifact',
    );
  }

  if (artifact.expired) {
    throw new PRResolutionError(
      `The artifact "${binaryName}" has expired (artifacts are retained for 7 days).\n` +
        `You may need to re-run the workflow or push a new commit to the PR.`,
      'artifact_expired',
    );
  }

  const warning =
    run.conclusion && run.conclusion !== 'success'
      ? `The workflow run did not fully succeed (conclusion: ${run.conclusion}). The binary artifact may still be valid but proceed with caution.`
      : undefined;

  return {
    artifactId: artifact.id,
    artifactName: artifact.name,
    prNumber,
    runId: run.id,
    headSha: run.head_sha,
    authToken,
    warning,
  };
};

/**
 * Download a PR artifact ZIP and extract the binary to the destination path.
 */
export const downloadPRArtifact = async (options: {
  artifactId: number;
  authToken: string;
  destPath: string;
}): Promise<void> => {
  const { artifactId, authToken, destPath } = options;

  const octokit = new Octokit({
    auth: authToken,
    baseUrl: GH_API_URL,
  });

  logInfo('Downloading PR artifact', { artifactId });

  const { data } = await octokit.rest.actions.downloadArtifact({
    ...REPO_INFO,
    artifact_id: artifactId,
    archive_format: 'zip',
  });

  // Write the ZIP to a temp file
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qnscmcp-pr-artifact-'));

  try {
    const zipPath = path.join(tempDir, 'artifact.zip');

    fs.writeFileSync(zipPath, Buffer.from(data as ArrayBuffer));
    logDebug('Artifact ZIP downloaded', { zipPath, size: (data as ArrayBuffer).byteLength });

    // Extract the ZIP
    const extractDir = path.join(tempDir, 'extracted');
    fs.mkdirSync(extractDir, { recursive: true });

    extractZip(zipPath, extractDir);

    // Find the binary in the extracted directory
    const files = fs.readdirSync(extractDir);
    if (files.length === 0) {
      throw new Error('Artifact ZIP was empty — no files found after extraction.');
    }

    // Prefer exact binary name match; fall back to first file for single-file artifacts
    const { binaryName } = getPlatformInfo();
    const binaryFile =
      files.find((f) => f === binaryName) || (files.length === 1 ? files[0] : null);

    if (!binaryFile) {
      const available = files.join(', ');
      throw new Error(
        `Could not identify binary in extracted artifact. Expected "${binaryName}" but found: ${available}`,
      );
    }

    if (files.length > 1) {
      logDebug('Multiple files in artifact ZIP, selected binary', { binaryFile, allFiles: files });
    }

    const extractedBinaryPath = path.join(extractDir, binaryFile);
    fs.copyFileSync(extractedBinaryPath, destPath);
    logInfo('PR artifact extracted to temp path', { destPath });
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error: unknown) {
      logDebug('Failed to clean up PR artifact temp directory', { tempDir, error: errMsg(error) });
    }
  }
};

/**
 * Extract a ZIP file to an output directory.
 * Uses execFileSync with PowerShell on Windows (with single-quote escaping via -LiteralPath).
 * Uses spawnSync with array arguments on Unix to prevent command injection.
 */
export const extractZip = (zipPath: string, outputDir: string): void => {
  if (os.platform() === 'win32') {
    try {
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outputDir.replace(/'/g, "''")}' -Force`,
        ],
        { stdio: ['ignore', 'ignore', 'pipe'] },
      );
    } catch (error: unknown) {
      const execError = error as { stderr?: Buffer | string; status?: number | null };
      const stderr = execError.stderr?.toString().trim();
      throw new Error(
        `Failed to extract ZIP archive${stderr ? ': ' + stderr : ''} (exit code: ${execError.status})`,
      );
    }
  } else {
    const result = spawnSync('unzip', ['-o', zipPath, '-d', outputDir], { stdio: 'ignore' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`unzip exited with code ${result.status}`);
  }
};

/**
 * Known error codes for PR artifact resolution failures.
 */
export type PRResolutionErrorCode =
  | 'no_auth'
  | 'pr_not_found'
  | 'api_error'
  | 'no_runs'
  | 'no_platform_artifact'
  | 'artifact_expired';

/**
 * Error class for PR artifact resolution failures.
 */
export class PRResolutionError extends Error {
  constructor(
    message: string,
    public readonly code: PRResolutionErrorCode,
  ) {
    super(message);
    this.name = 'PRResolutionError';
  }
}
