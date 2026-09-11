/**
 * Release fetching, downloading, and verification logic.
 */
import {
  parseChecksumFile,
  httpsGet,
  downloadFile,
  calculateFileChecksum,
  GITHUB_API_HOST,
  REPO_OWNER,
  REPO_NAME,
  type InstallConfig,
} from './utils';

export interface ReleaseInfo {
  tagName: string;
  downloadUrl: string;
  checksumUrl: string | null;
  isPrerelease: boolean;
}

export interface ChecksumFetchResult {
  checksum: string | null;
  warning?: string;
}

export interface ReleaseOptions {
  /** If true, include prereleases when finding the latest version */
  beta?: boolean;
}

export async function getLatestRelease(
  token: string | null,
  config: InstallConfig,
  options: ReleaseOptions = {}
): Promise<ReleaseInfo> {
  const { beta = false } = options;

  let release;

  if (beta) {
    // Fetch recent releases and sort by published_at to find the most recent
    // We fetch multiple releases because GitHub's API sort order can be unreliable
    const url = `https://${GITHUB_API_HOST}/repos/${REPO_OWNER}/${REPO_NAME}/releases?per_page=20`;
    const response = await httpsGet(url, { token });

    if (response.statusCode !== 200) {
      throw new Error(`Failed to fetch releases: HTTP ${response.statusCode}`);
    }

    let releases;
    try {
      releases = JSON.parse(response.body);
    } catch {
      throw new Error('Failed to parse releases API response: invalid JSON');
    }

    if (!releases || releases.length === 0) {
      throw new Error('No releases found.');
    }

    // Sort by published_at descending to ensure we get the most recent release
    releases.sort((a: any, b: any) => {
      const dateA = new Date(a.published_at || a.created_at).getTime();
      const dateB = new Date(b.published_at || b.created_at).getTime();
      return dateB - dateA;
    });

    release = releases[0];
  } else {
    // Fetch the latest stable release (excludes prereleases)
    const url = `https://${GITHUB_API_HOST}/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
    const response = await httpsGet(url, { token });

    if (response.statusCode !== 200) {
      throw new Error(`Failed to fetch release info: HTTP ${response.statusCode}`);
    }

    try {
      release = JSON.parse(response.body);
    } catch {
      throw new Error('Failed to parse release API response: invalid JSON');
    }
  }

  const asset = release.assets?.find((a: any) => a.name === config.binaryName);

  if (!asset) {
    throw new Error(`Binary ${config.binaryName} not found in release ${release.tag_name}`);
  }

  if (!asset.url || typeof asset.url !== 'string') {
    throw new Error(`Invalid download URL for ${config.binaryName} in release ${release.tag_name}`);
  }

  const checksumAsset = release.assets?.find(
    (a: any) => a.name === `${config.binaryName}.sha256`
  );

  return {
    tagName: release.tag_name,
    downloadUrl: asset.url,
    checksumUrl: checksumAsset?.url || null,
    isPrerelease: release.prerelease === true,
  };
}

export async function downloadBinary(
  downloadUrl: string,
  destPath: string,
  token: string | null,
  onProgress: (percent: number) => void
): Promise<void> {
  return downloadFile(downloadUrl, destPath, onProgress, { token });
}

export async function fetchExpectedChecksum(
  checksumUrl: string,
  token: string | null
): Promise<ChecksumFetchResult> {
  try {
    // Use application/octet-stream to get the raw file content from GitHub asset URLs
    const response = await httpsGet(checksumUrl, { token, accept: 'application/octet-stream' });

    if (response.statusCode !== 200) {
      const warning = `Failed to fetch checksum: HTTP ${response.statusCode}`;
      console.warn(warning);
      return { checksum: null, warning };
    }

    const checksum = parseChecksumFile(response.body);
    if (checksum) {
      return { checksum };
    }

    const warning = 'Invalid checksum file format';
    console.warn(warning);
    return { checksum: null, warning };
  } catch (error: any) {
    const warning = `Error fetching checksum: ${error.message}`;
    console.warn(warning);
    return { checksum: null, warning };
  }
}

export async function verifyChecksum(
  filePath: string,
  expectedChecksum: string | null
): Promise<void> {
  if (!expectedChecksum) {
    throw new Error(
      'Checksum file missing from release. ' +
      'This is a release pipeline issue - please report it.'
    );
  }

  const actualChecksum = await calculateFileChecksum(filePath);

  if (actualChecksum.toLowerCase() !== expectedChecksum.toLowerCase()) {
    throw new Error(
      `Checksum verification failed!\n` +
      `Expected: ${expectedChecksum}\n` +
      `Actual: ${actualChecksum}\n` +
      `The downloaded file may be corrupted or tampered with.`
    );
  }

  console.log('Checksum verification passed');
}
