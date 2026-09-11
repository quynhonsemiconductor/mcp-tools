/**
 * Workflow artifact fetching, downloading, and verification logic.
 * Used for PR builds where binaries are stored as workflow artifacts
 * instead of GitHub Releases.
 *
 * GitHub Actions artifacts are always zipped, so this module handles
 * downloading and extracting them.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import {
  parseChecksumFile,
  httpsGet,
  getRedirectUrl,
  downloadFile,
  GITHUB_API_HOST,
  REPO_OWNER,
  REPO_NAME,
  type InstallConfig,
} from './utils';

export interface ArtifactInfo {
  binaryArtifactId: number;
  binaryArtifactName: string;
  binaryArtifactSize: number;
  checksumArtifactId: number | null;
  checksumArtifactName: string | null;
}

/**
 * List artifacts for a workflow run and find the matching binary/checksum pair.
 *
 * @param runId - The workflow run ID
 * @param token - GitHub token with actions:read scope
 * @param config - Install configuration with binary name
 */
export async function getArtifactInfo(
  runId: string,
  token: string,
  config: InstallConfig
): Promise<ArtifactInfo> {
  const url = `https://${GITHUB_API_HOST}/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs/${runId}/artifacts`;
  const response = await httpsGet(url, { token });

  if (response.statusCode !== 200) {
    throw new Error(`Failed to fetch artifacts: HTTP ${response.statusCode}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    throw new Error('Failed to parse artifacts API response: invalid JSON');
  }
  const artifacts = parsed.artifacts || [];

  // Find binary artifact (name matches exactly)
  const binaryArtifact = artifacts.find(
    (a: any) => a.name === config.binaryName
  );

  if (!binaryArtifact) {
    const availableArtifacts = artifacts.map((a: any) => a.name).join(', ');
    throw new Error(
      `Binary artifact "${config.binaryName}" not found in workflow run ${runId}.\n` +
      `Available artifacts: ${availableArtifacts || 'none'}`
    );
  }

  if (binaryArtifact.expired) {
    throw new Error(
      `Artifact "${config.binaryName}" has expired.\n` +
      `PR artifacts typically have 7-day retention.\n` +
      `Please re-run the PR workflow to regenerate artifacts.`
    );
  }

  // Find checksum artifact
  const checksumArtifact = artifacts.find(
    (a: any) => a.name === `${config.binaryName}.sha256`
  );

  return {
    binaryArtifactId: binaryArtifact.id,
    binaryArtifactName: binaryArtifact.name,
    binaryArtifactSize: binaryArtifact.size_in_bytes || 0,
    checksumArtifactId: checksumArtifact?.id || null,
    checksumArtifactName: checksumArtifact?.name || null,
  };
}

/**
 * Get the download URL for an artifact (GitHub returns a redirect).
 */
async function getArtifactDownloadUrl(
  artifactId: number,
  token: string
): Promise<string> {
  const url = `https://${GITHUB_API_HOST}/repos/${REPO_OWNER}/${REPO_NAME}/actions/artifacts/${artifactId}/zip`;
  return getRedirectUrl(url, { token });
}

/**
 * Escape a string for use in PowerShell single-quoted strings.
 * Single quotes are escaped by doubling them.
 * Exported for testing.
 */
export function escapePowerShellPath(path: string): string {
  return path.replace(/'/g, "''");
}

/**
 * Extract a zip file using platform-appropriate tools.
 * Uses unzip on macOS/Linux and PowerShell on Windows.
 */
async function extractZip(zipPath: string, outputDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    let proc;

    if (platform === 'win32') {
      // Use PowerShell's Expand-Archive on Windows
      // Escape single quotes in paths to prevent command injection
      const safeZipPath = escapePowerShellPath(zipPath);
      const safeOutputDir = escapePowerShellPath(outputDir);
      proc = spawn('powershell', [
        '-NoProfile',
        '-Command',
        `Expand-Archive -Path '${safeZipPath}' -DestinationPath '${safeOutputDir}' -Force`
      ], { stdio: 'pipe' });
    } else {
      // Use unzip on macOS/Linux
      // Arguments are passed as array elements, not interpolated into a shell command
      proc = spawn('unzip', ['-o', zipPath, '-d', outputDir], { stdio: 'pipe' });
    }

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Failed to extract zip (exit code ${code})`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn unzip: ${err.message}`));
    });
  });
}

/**
 * Download an artifact zip and extract the binary.
 *
 * Note: GitHub Actions artifacts are always zipped, even single files.
 *
 * @param artifactId - The artifact ID to download
 * @param destPath - Where to save the extracted binary
 * @param token - GitHub token with actions:read scope
 * @param artifactName - Name of the file inside the zip
 * @param onProgress - Progress callback (0-100)
 * @param expectedSize - Expected artifact size in bytes (for progress when Content-Length missing)
 */
export async function downloadArtifact(
  artifactId: number,
  destPath: string,
  token: string,
  artifactName: string,
  onProgress: (percent: number) => void,
  expectedSize: number = 0
): Promise<void> {
  // Use mkdtempSync to create secure, unpredictable temp directory
  // This prevents symlink attacks in shared temp directories
  const secureTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qnsc-mcp-artifact-'));
  const zipPath = path.join(secureTempDir, 'artifact.zip');
  const extractDir = path.join(secureTempDir, 'extract');

  try {
    // Step 1: Get the download URL (GitHub redirects to blob storage)
    const downloadUrl = await getArtifactDownloadUrl(artifactId, token);

    // Step 2: Download the zip file (use longer timeout for large artifacts)
    await downloadFile(downloadUrl, zipPath, onProgress, { timeout: 120000, expectedSize });

    // Step 3: Extract the zip (use recursive:true unconditionally to avoid TOCTOU)
    fs.mkdirSync(extractDir, { recursive: true });
    await extractZip(zipPath, extractDir);

    // Step 4: Find and move the binary
    const files = fs.readdirSync(extractDir);
    const binaryFile = files.find(f => f === artifactName);

    if (!binaryFile) {
      throw new Error(`Binary "${artifactName}" not found in artifact. Contents: ${files.join(', ')}`);
    }

    const extractedPath = path.join(extractDir, binaryFile);
    fs.renameSync(extractedPath, destPath);

    // Step 5: Clean up the entire secure temp directory
    fs.rmSync(secureTempDir, { recursive: true, force: true });
  } catch (error) {
    // Clean up all temporary files on error
    try {
      fs.rmSync(secureTempDir, { recursive: true, force: true });
    } catch { /* ignore cleanup errors */ }
    try {
      // Clean up partial destPath if it was created
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    } catch { /* ignore cleanup errors */ }
    throw error;
  }
}

/**
 * Fetch and parse the checksum from a checksum artifact.
 *
 * @param checksumArtifactId - The artifact ID for the checksum file
 * @param token - GitHub token with actions:read scope
 * @param checksumArtifactName - Name of the checksum file
 */
export async function fetchArtifactChecksum(
  checksumArtifactId: number,
  token: string,
  checksumArtifactName: string
): Promise<string | null> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checksum-'));
  const zipPath = path.join(tempDir, 'checksum.zip');

  try {
    // Get download URL
    const downloadUrl = await getArtifactDownloadUrl(checksumArtifactId, token);

    // Download the zip
    await downloadFile(downloadUrl, zipPath, () => {});

    // Extract
    await extractZip(zipPath, tempDir);

    // Read the checksum file
    const checksumPath = path.join(tempDir, checksumArtifactName);
    if (fs.existsSync(checksumPath)) {
      const content = fs.readFileSync(checksumPath, 'utf-8');
      const checksum = parseChecksumFile(content);
      fs.rmSync(tempDir, { recursive: true, force: true });
      return checksum;
    }

    // Look for any .sha256 file
    const files = fs.readdirSync(tempDir);
    const sha256File = files.find(f => f.endsWith('.sha256'));
    if (sha256File) {
      const content = fs.readFileSync(path.join(tempDir, sha256File), 'utf-8');
      const checksum = parseChecksumFile(content);
      fs.rmSync(tempDir, { recursive: true, force: true });
      return checksum;
    }

    console.warn('Checksum file not found in artifact');
    fs.rmSync(tempDir, { recursive: true, force: true });
    return null;
  } catch (error) {
    console.warn('Failed to fetch checksum from artifact:', error);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
    return null;
  }
}
