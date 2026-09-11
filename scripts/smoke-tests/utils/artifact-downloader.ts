/**
 * GitHub Release Binary Downloader
 *
 * Downloads binary artifacts from GitHub releases for smoke testing.
 * Caches binaries with versioned filenames for multi-version testing.
 * 
 * Uses Octokit for GitHub API interactions with GHE support.
 */

import { chmodSync, existsSync, mkdirSync } from 'fs';
import { Octokit } from 'octokit';
import { join, resolve } from 'path';
import { detectPlatform, getArchitecture, type Platform } from './platform';

/**
 * GitHub configuration for Octokit
 */
interface GitHubConfig {
  /** GitHub API base URL (for GHE) */
  baseUrl: string;
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** GitHub token for authentication */
  token: string;
}

/**
 * Release channel for downloading binaries
 */
export type ReleaseChannel = 'stable' | 'beta' | 'latest' | string;

/**
 * Mapping of platform-arch to artifact names
 */
const ARTIFACT_NAMES: Record<string, string> = {
  'windows-x64': 'qnsc-mcp-win-x64.exe',
  'macos-x64': 'qnsc-mcp-macos-x64',
  'macos-arm64': 'qnsc-mcp-macos-arm64',
  'linux-x64': 'qnsc-mcp-linux-x64',
  'linux-arm64': 'qnsc-mcp-linux-arm64'
};

/** Cached Octokit instance */
let octokitInstance: Octokit | null = null;

/**
 * Wait for an executable file to be runnable (not locked by antivirus or file system).
 * On Windows, antivirus scanning can lock new executables for several seconds.
 * 
 * This actually attempts to spawn the binary with --version to verify it's executable,
 * which is a more reliable test than just opening the file for reading.
 * 
 * @param filePath - Path to the executable to check
 * @param maxAttempts - Maximum number of attempts (default: 15)
 * @param delayMs - Delay between attempts in ms (default: 500)
 */
async function waitForFileAccess(
  filePath: string,
  maxAttempts: number = 15,
  delayMs: number = 500
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Actually try to spawn the binary - this is the real test for EBUSY
      const proc = Bun.spawn([filePath, '--version'], {
        stdout: 'ignore',
        stderr: 'ignore'
      });
      const exitCode = await proc.exited;
      if (exitCode === 0) {
        return; // Binary is executable
      }
      // Non-zero exit but not locked - might be okay, let it through
      return;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      // Check if it's an EBUSY error (file locked)
      if (message.includes('EBUSY') || message.includes('resource busy')) {
        if (attempt < maxAttempts - 1) {
          console.log(`  Waiting for file to be ready (attempt ${attempt + 1}/${maxAttempts})...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } else {
        // Some other error - let it through and fail later with a clearer message
        return;
      }
    }
  }
  console.warn(`  Warning: File may still be locked after ${maxAttempts} attempts`);
}

/**
 * Get or create an Octokit instance
 */
function getOctokit(config: GitHubConfig): Octokit {
  if (!octokitInstance) {
    octokitInstance = new Octokit({
      auth: config.token,
      baseUrl: config.baseUrl
    });
  }
  return octokitInstance;
}

/**
 * Get the artifact name for the current platform
 */
export function getArtifactNameForPlatform(
  platform: Platform = detectPlatform(),
  arch: string = getArchitecture()
): string {
  const key = `${platform}-${arch}`;
  const artifactName = ARTIFACT_NAMES[key];

  if (!artifactName) {
    throw new Error(`No artifact available for platform: ${key}`);
  }

  return artifactName;
}

/**
 * Get a versioned artifact name (e.g., qnsc-mcp-win-x64-3.2.0.exe)
 */
export function getVersionedArtifactName(
  version: string,
  platform: Platform = detectPlatform(),
  arch: string = getArchitecture()
): string {
  const baseName = getArtifactNameForPlatform(platform, arch);
  const ext = platform === 'windows' ? '.exe' : '';
  const nameWithoutExt = baseName.replace(/\.exe$/, '');
  
  // Normalize version (remove leading 'v' if present)
  const normalizedVersion = version.replace(/^v/, '');
  
  return `${nameWithoutExt}-${normalizedVersion}${ext}`;
}

/**
 * Get default GitHub configuration from environment
 */
export function getGitHubConfig(): GitHubConfig {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    throw new Error(
      'GitHub token not found. Set GITHUB_TOKEN or GH_TOKEN environment variable.'
    );
  }

  return {
    baseUrl: process.env.GITHUB_API_URL || 'https://api.github.com',
    owner: process.env.GITHUB_OWNER || 'quynhonsemiconductor',
    repo: process.env.GITHUB_REPO || 'mcp-tools',
    token
  };
}

/**
 * Get all releases from GitHub using Octokit
 */
async function getAllReleases(
  config: GitHubConfig,
  perPage: number = 30
) {
  const octokit = getOctokit(config);
  try {
    const { data } = await octokit.rest.repos.listReleases({
      owner: config.owner,
      repo: config.repo,
      per_page: perPage
    });
    return data;
  } catch {
    return [];
  }
}

/**
 * Get a release by channel (stable, beta, latest, or specific tag)
 * 
 * @param config - GitHub API configuration
 * @param channel - Release channel: 'stable' (latest non-prerelease), 'beta' (latest prerelease), 
 *                  'latest' (latest regardless of prerelease status), or a specific tag like 'v3.2.0'
 */
export async function getRelease(
  config: GitHubConfig,
  channel: ReleaseChannel = 'stable'
) {
  const octokit = getOctokit(config);
  
  try {
    // If specific tag requested, fetch that release directly
    if (channel !== 'stable' && channel !== 'beta' && channel !== 'latest') {
      const tag = channel.startsWith('v') ? channel : `v${channel}`;
      try {
        const { data } = await octokit.rest.repos.getReleaseByTag({
          owner: config.owner,
          repo: config.repo,
          tag
        });
        return data;
      } catch {
        console.log(`  Release with tag ${tag} not found`);
        return null;
      }
    }
    
    // Get all releases to find the right one
    const releases = await getAllReleases(config);
    if (releases.length === 0) return null;
    
    // Filter based on channel
    if (channel === 'stable') {
      // Latest non-prerelease (no -beta, -alpha, -rc in tag)
      const stableReleases = releases.filter(r => 
        !r.tag_name.includes('-beta') && 
        !r.tag_name.includes('-alpha') && 
        !r.tag_name.includes('-rc')
      );
      return stableReleases[0] || null;
    } else if (channel === 'beta') {
      // Latest prerelease (has -beta, -alpha, or -rc in tag)
      const prereleases = releases.filter(r => 
        r.tag_name.includes('-beta') || 
        r.tag_name.includes('-alpha') || 
        r.tag_name.includes('-rc')
      );
      return prereleases[0] || null;
    } else {
      // 'latest' - just return the most recent release
      return releases[0] || null;
    }
  } catch {
    return null;
  }
}

/**
 * Get the latest release version from GitHub
 */
export async function getLatestReleaseVersion(
  config: GitHubConfig,
  channel: ReleaseChannel = 'stable'
): Promise<string | null> {
  const release = await getRelease(config, channel);
  if (!release) return null;
  // Remove 'v' prefix if present
  return release.tag_name.replace(/^v/, '');
}

/**
 * Download a release asset directly (no unzipping needed)
 * 
 * Note: For binary downloads, we use Octokit's getReleaseAsset with a custom
 * mediaType to get the raw binary data. This handles GHE authentication properly.
 * 
 * @param config - GitHub API configuration
 * @param assetId - The release asset ID
 * @param assetName - The asset filename (for display)
 * @param assetSize - The asset size in bytes (for display)
 * @param outputDir - Directory to save the file
 * @param outputName - Optional custom filename (defaults to assetName)
 */
async function downloadReleaseAsset(
  config: GitHubConfig,
  assetId: number,
  assetName: string,
  assetSize: number,
  outputDir: string,
  outputName?: string
): Promise<string> {
  const octokit = getOctokit(config);
  
  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const fileName = outputName || assetName;
  const outputPath = join(outputDir, fileName);

  console.log(`  Downloading ${assetName} → ${fileName} (${(assetSize / 1024 / 1024).toFixed(2)} MB)...`);

  // Use Octokit to download the asset with proper auth and redirect handling
  const { data } = await octokit.rest.repos.getReleaseAsset({
    owner: config.owner,
    repo: config.repo,
    asset_id: assetId,
    headers: {
      accept: 'application/octet-stream'
    }
  });

  // The data comes back as an ArrayBuffer when using octet-stream
  await Bun.write(outputPath, data as unknown as ArrayBuffer);

  // Make binary executable on Unix
  if (detectPlatform() !== 'windows') {
    chmodSync(outputPath, 0o755);
  } else {
    // On Windows, wait for file to be accessible (antivirus scanning, etc.)
    await waitForFileAccess(outputPath);
  }

  console.log(`  ✓ Downloaded to: ${outputPath}`);

  return outputPath;
}

/**
 * Get workflow runs for a PR using Octokit
 */
async function getWorkflowRunsForPR(
  config: GitHubConfig,
  prNumber: number
) {
  const octokit = getOctokit(config);
  
  // First get PR details to find the head SHA
  const { data: pr } = await octokit.rest.pulls.get({
    owner: config.owner,
    repo: config.repo,
    pull_number: prNumber
  });
  
  // Get workflow runs for that commit
  const { data } = await octokit.rest.actions.listWorkflowRunsForRepo({
    owner: config.owner,
    repo: config.repo,
    head_sha: pr.head.sha,
    per_page: 10
  });
  
  return data.workflow_runs;
}

/**
 * Get artifacts for a workflow run using Octokit
 */
async function getWorkflowArtifacts(
  config: GitHubConfig,
  runId: number
) {
  const octokit = getOctokit(config);
  
  const { data } = await octokit.rest.actions.listWorkflowRunArtifacts({
    owner: config.owner,
    repo: config.repo,
    run_id: runId
  });
  
  return data.artifacts;
}

/**
 * Download and extract a workflow artifact (artifacts are always zipped)
 * 
 * Note: Octokit's downloadArtifact returns a redirect URL, so we still need
 * to use fetch for the actual download, but Octokit handles the auth.
 */
async function downloadWorkflowArtifact(
  config: GitHubConfig,
  artifactId: number,
  artifactName: string,
  artifactSize: number,
  outputDir: string
): Promise<string> {
  const octokit = getOctokit(config);
  
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const zipPath = join(outputDir, `${artifactName}.zip`);

  console.log(`  Downloading artifact ${artifactName} (${(artifactSize / 1024 / 1024).toFixed(2)} MB)...`);

  // Download the artifact zip using Octokit
  const { data } = await octokit.rest.actions.downloadArtifact({
    owner: config.owner,
    repo: config.repo,
    artifact_id: artifactId,
    archive_format: 'zip'
  });

  // Write the zip file
  await Bun.write(zipPath, data as unknown as ArrayBuffer);

  // Extract the zip - use PowerShell on Windows, unzip on Unix
  console.log(`  Extracting ${artifactName}...`);
  const platform = detectPlatform();
  
  if (platform === 'windows') {
    // Use PowerShell's Expand-Archive on Windows
    const proc = Bun.spawn(['powershell', '-Command', `Expand-Archive -Path '${zipPath}' -DestinationPath '${outputDir}' -Force`], {
      stdout: 'ignore',
      stderr: 'pipe'
    });
    await proc.exited;
  } else {
    // Use unzip on macOS/Linux
    const proc = Bun.spawn(['unzip', '-o', zipPath, '-d', outputDir], {
      stdout: 'ignore',
      stderr: 'pipe'
    });
    await proc.exited;
  }

  // Remove the zip file
  const { unlinkSync } = await import('fs');
  unlinkSync(zipPath);

  // Find the binary in the extracted files
  const { readdirSync } = await import('fs');
  const files = readdirSync(outputDir);
  const binaryName = getArtifactNameForPlatform();
  const extractedBinary = files.find(f => f === binaryName || f === artifactName);
  
  if (!extractedBinary) {
    throw new Error(`Binary not found in artifact. Files: ${files.join(', ')}`);
  }

  const binaryPath = join(outputDir, extractedBinary);
  
  // Make executable on Unix
  if (detectPlatform() !== 'windows') {
    chmodSync(binaryPath, 0o755);
  } else {
    // On Windows, wait for file to be accessible (antivirus scanning, etc.)
    await waitForFileAccess(binaryPath);
  }

  console.log(`  ✓ Extracted to: ${binaryPath}`);
  return binaryPath;
}

/**
 * Download binary artifact from a PR's CI workflow
 */
export async function downloadBinaryFromPR(
  prNumber: number,
  outputDir?: string,
  forceDownload: boolean = false
): Promise<string> {
  const config = getGitHubConfig();
  const cacheDir = outputDir || resolve(__dirname, '../../../.smoke-test-binaries');
  const platform = detectPlatform();
  const arch = getArchitecture();

  console.log(`\nFetching PR #${prNumber}...`);

  // Get workflow runs for this PR
  const runs = await getWorkflowRunsForPR(config, prNumber);
  
  if (runs.length === 0) {
    throw new Error(`No workflow runs found for PR #${prNumber}`);
  }

  // Find a successful run from the PR binaries workflow (produces binary artifacts)
  const binaryWorkflowRun = runs.find(r => 
    r.path.includes('pr-binaries') && 
    r.status === 'completed' && 
    r.conclusion === 'success'
  );

  // Fall back to any successful run with artifacts
  const successfulRun = binaryWorkflowRun || runs.find(r => 
    r.status === 'completed' && r.conclusion === 'success'
  );

  if (!successfulRun) {
    const latestRun = runs[0];
    throw new Error(
      `No successful workflow run found for PR #${prNumber}. ` +
      `Latest run status: ${latestRun.status}, conclusion: ${latestRun.conclusion}`
    );
  }

  console.log(`  Found workflow run: ${successfulRun.id}`);
  console.log(`  Workflow: ${successfulRun.name}`);
  console.log(`  Status: ${successfulRun.conclusion}`);
  console.log(`  Created: ${successfulRun.created_at}`);

  // Get artifacts for this run
  const artifacts = await getWorkflowArtifacts(config, successfulRun.id);
  
  if (artifacts.length === 0) {
    // Check if there's a PR binaries workflow that could be triggered.
    // Web UI host differs from the API host on github.com (github.com vs
    // api.github.com), so this is hardcoded rather than derived from baseUrl.
    const prBinariesUrl = `https://github.com/${config.owner}/${config.repo}/actions/workflows/pr-binaries.yml`;
    throw new Error(
      `No artifacts found for workflow "${successfulRun.name}" (run ${successfulRun.id}).\n\n` +
      `This PR may not have triggered the binary build workflow.\n` +
      `To manually trigger a binary build, go to:\n` +
      `  ${prBinariesUrl}\n\n` +
      `Click "Run workflow" and select the PR branch.`
    );
  }

  // Find the binary artifact for our platform
  const expectedArtifactName = getArtifactNameForPlatform(platform, arch);
  const artifact = artifacts.find(a => 
    a.name === expectedArtifactName || 
    a.name.includes(platform) && a.name.includes(arch)
  );

  if (!artifact) {
    const availableArtifacts = artifacts.map(a => a.name).join(', ');
    throw new Error(
      `No artifact found for ${platform}-${arch}. Available: ${availableArtifacts}`
    );
  }

  if (artifact.expired) {
    // Web UI host differs from the API host on github.com, so hardcoded (see above).
    const runUrl = `https://github.com/${config.owner}/${config.repo}/actions/runs/${successfulRun.id}`;
    throw new Error(
      `Artifact ${artifact.name} has expired (PRs typically have 14-day retention).\n\n` +
      `To regenerate artifacts, re-run the workflow:\n` +
      `  ${runUrl}\n\n` +
      `Click "Re-run all jobs" in the top-right corner.\n` +
      `Wait for the build to complete, then try again.`
    );
  }

  // Check cache - use PR number in filename
  const prBinaryName = `${expectedArtifactName.replace(/\.exe$/, '')}-pr${prNumber}${platform === 'windows' ? '.exe' : ''}`;
  const cachedPath = join(cacheDir, prBinaryName);
  
  if (!forceDownload && existsSync(cachedPath)) {
    console.log(`\n✓ PR binary already cached`);
    console.log(`  Path: ${cachedPath}`);
    return cachedPath;
  }

  console.log(`\n↓ Downloading PR #${prNumber} artifact...`);
  
  // Download to a temp subdir, then rename
  const tempDir = join(cacheDir, `pr${prNumber}-temp`);
  const downloadedPath = await downloadWorkflowArtifact(
    config, 
    artifact.id, 
    artifact.name, 
    artifact.size_in_bytes, 
    tempDir
  );
  
  // Move to final location with PR-specific name
  const { renameSync, rmSync } = await import('fs');
  renameSync(downloadedPath, cachedPath);
  rmSync(tempDir, { recursive: true, force: true });

  console.log(`  ✓ Saved as: ${cachedPath}`);
  return cachedPath;
}

/**
 * Download the binary for the current platform from GitHub releases.
 * 
 * Binaries are cached with version in filename:
 *   .smoke-test-binaries/qnsc-mcp-win-x64-3.2.0.exe
 *   .smoke-test-binaries/qnsc-mcp-win-x64-3.3.0-beta.3.exe
 * 
 * @param outputDir - Directory for cached artifacts
 * @param forceDownload - Force download even if cached artifact exists
 * @param channel - Release channel: 'stable', 'beta', 'latest', or a specific tag
 */
export async function downloadLatestBinaryForPlatform(
  outputDir?: string,
  forceDownload: boolean = false,
  channel: ReleaseChannel = 'stable'
): Promise<string> {
  const config = getGitHubConfig();
  const artifactName = getArtifactNameForPlatform();
  const cacheDir = outputDir || resolve(__dirname, '../../../.smoke-test-binaries');

  console.log(`\nChecking for ${channel} binary...`);
  console.log(`  Platform: ${detectPlatform()}-${getArchitecture()}`);
  console.log(`  Channel: ${channel}`);

  // Try GitHub Release first (permanent, preferred for released versions)
  const release = await getRelease(config, channel);
  if (release) {
    const asset = release.assets.find((a) => a.name === artifactName);
    const version = release.tag_name.replace(/^v/, '');
    const versionedName = getVersionedArtifactName(version);
    const binaryPath = join(cacheDir, versionedName);
    
    if (asset) {
      console.log(`\nFound release: ${release.tag_name}`);
      console.log(`  Published: ${release.published_at}`);
      console.log(`  Binary: ${versionedName}`);

      // Check if versioned binary already exists
      if (!forceDownload && existsSync(binaryPath)) {
        console.log(`\n✓ Binary already cached (${release.tag_name})`);
        console.log(`  Path: ${binaryPath}`);
        return binaryPath;
      }

      // Download from release with versioned filename
      console.log(`\n↓ Downloading ${release.tag_name}...`);

      const downloadedPath = await downloadReleaseAsset(
        config, 
        asset.id, 
        asset.name, 
        asset.size, 
        cacheDir, 
        versionedName
      );

      return downloadedPath;
    }
  }

  // No release found for this channel
  throw new Error(
    `No binary found for channel '${channel}' on platform ${detectPlatform()}-${getArchitecture()}`
  );
}
