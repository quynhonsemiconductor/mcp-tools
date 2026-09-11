import { execSync } from 'child_process';
import { logWarn } from '../services/logger';
import { DOCUMENTATION_URLS } from '../lib/guidance-links';

/**
 * Result of architecture detection
 */
export interface ArchitectureInfo {
  /** The binary/process architecture (from process.arch) */
  processArch: string;
  /** The system architecture (detected from hardware) */
  systemArch: string;
  /** Whether there's a mismatch between binary and system architecture */
  isMismatch: boolean;
  /** Whether this is running x64 binary on ARM Mac via Rosetta */
  isX64OnAppleSilicon: boolean;
  /** Platform info (darwin, linux, win32, etc.) */
  platform: string;
  /** Recommended binary architecture for this system */
  recommendedArch: string;
}

/**
 * Detect system architecture information and check for mismatches
 */
export function detectArchitecture(): ArchitectureInfo {
  const processArch = process.arch;
  const platform = process.platform;
  let systemArch = processArch;
  let isX64OnAppleSilicon = false;

  // Detect if running x64 binary on Apple Silicon via Rosetta
  if (processArch === 'x64' && platform === 'darwin') {
    try {
      // Check if the actual hardware is Apple Silicon
      const cpuBrand = execSync('sysctl -n machdep.cpu.brand_string', { encoding: 'utf8' }).trim();
      if (cpuBrand.includes('Apple')) {
        systemArch = 'arm64';
        isX64OnAppleSilicon = true;
      }
    } catch {
      // If sysctl fails, we can't detect Apple Silicon, so assume system matches process
    }
  }

  const isMismatch = processArch !== systemArch;
  const recommendedArch = getRecommendedArchitecture(systemArch, platform);

  return {
    processArch,
    systemArch,
    isMismatch,
    isX64OnAppleSilicon,
    platform,
    recommendedArch,
  };
}

/**
 * Get the recommended binary architecture for a given system
 */
function getRecommendedArchitecture(systemArch: string, platform: string): string {
  // Map system architecture to recommended binary architecture
  if (platform === 'darwin') {
    return systemArch === 'arm64' ? 'arm64' : 'x64';
  }
  if (platform === 'win32') {
    return 'x64'; // Most Windows binaries are x64
  }
  if (platform === 'linux') {
    return systemArch === 'arm64' ? 'arm64' : 'x64';
  }
  return systemArch;
}

/**
 * Get the binary filename for the recommended architecture
 */
export function getRecommendedBinaryName(archInfo: ArchitectureInfo): string {
  const { platform, recommendedArch } = archInfo;

  if (platform === 'darwin') {
    return `qnsc-mcp-macos-${recommendedArch}`;
  }
  if (platform === 'win32') {
    return `qnsc-mcp-windows-${recommendedArch}.exe`;
  }
  if (platform === 'linux') {
    return `qnsc-mcp-linux-${recommendedArch}`;
  }

  return `qnsc-mcp-${platform}-${recommendedArch}`;
}

/**
 * Get a user-friendly warning message for architecture mismatch
 */
export function getArchitectureMismatchWarning(archInfo: ArchitectureInfo): string | null {
  if (!archInfo.isMismatch) {
    return null;
  }

  const recommendedBinary = getRecommendedBinaryName(archInfo);

  if (archInfo.isX64OnAppleSilicon) {
    return `⚠️  You are running the Intel (x64) binary on Apple Silicon.
   For better performance, download ${recommendedBinary} instead.
   Download: ${DOCUMENTATION_URLS.RELEASES}`;
  }

  return `⚠️  Architecture mismatch detected:
   Binary architecture: ${archInfo.processArch}
   System architecture: ${archInfo.systemArch}
   Recommended binary: ${recommendedBinary}
   Download: ${DOCUMENTATION_URLS.RELEASES}`;
}

/**
 * Display architecture mismatch warning to console if applicable
 */
export function displayArchitectureMismatchWarning(): void {
  const archInfo = detectArchitecture();
  const warning = getArchitectureMismatchWarning(archInfo);

  if (warning) {
    logWarn(warning);
  }
}
