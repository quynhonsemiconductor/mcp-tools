#!/usr/bin/env node
/**
 * Bun version check script
 *
 * Ensures the installed Bun version meets the minimum required version.
 * Runs as a preinstall hook to catch version mismatches early.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Read required version from package.json engines field
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')
);

const requiredVersionSpec = packageJson.engines?.bun;
if (!requiredVersionSpec) {
  console.log('⚠️  No Bun version requirement specified in package.json engines');
  process.exit(0);
}

// Extract minimum version from spec like ">=1.3.4" or "^1.3.4" or "1.3.4"
const requiredVersion = requiredVersionSpec.replace(/^[>=^~]+/, '');

/**
 * Parse a semver string into components
 * @param {string} version - Version string like "1.3.4"
 * @returns {{ major: number, minor: number, patch: number }}
 */
function parseSemver(version) {
  const [major, minor, patch] = version.split('.').map(Number);
  return { major: major || 0, minor: minor || 0, patch: patch || 0 };
}

/**
 * Compare two semver versions
 * @param {string} current - Current version
 * @param {string} required - Required minimum version
 * @returns {boolean} - True if current >= required
 */
function isVersionSatisfied(current, required) {
  const curr = parseSemver(current);
  const req = parseSemver(required);

  if (curr.major !== req.major) return curr.major > req.major;
  if (curr.minor !== req.minor) return curr.minor > req.minor;
  return curr.patch >= req.patch;
}

// Get current Bun version
let currentVersion;
try {
  currentVersion = execSync('bun --version', { encoding: 'utf-8' }).trim();
} catch {
  console.error('❌ Bun is not installed or not in PATH');
  console.error('   Please install Bun: https://bun.sh');
  process.exit(1);
}

// Check version
if (!isVersionSatisfied(currentVersion, requiredVersion)) {
  console.error('');
  console.error('╔══════════════════════════════════════════════════════════════╗');
  console.error('║                    BUN VERSION MISMATCH                      ║');
  console.error('╠══════════════════════════════════════════════════════════════╣');
  console.error(`║  Required: >= ${requiredVersion.padEnd(47)}║`);
  console.error(`║  Installed: ${currentVersion.padEnd(49)}║`);
  console.error('╠══════════════════════════════════════════════════════════════╣');
  console.error('║  Please update Bun:                                          ║');
  console.error('║                                                              ║');
  console.error('║    bun upgrade                                               ║');
  console.error('║                                                              ║');
  console.error('║  Or install a specific version:                              ║');
  console.error('║                                                              ║');
  console.error(`║    curl -fsSL https://bun.sh/install | bash -s "bun-v${requiredVersion}"  ║`);
  console.error('╚══════════════════════════════════════════════════════════════╝');
  console.error('');
  process.exit(1);
}

console.log(`✓ Bun version ${currentVersion} satisfies requirement ${requiredVersionSpec}`);
