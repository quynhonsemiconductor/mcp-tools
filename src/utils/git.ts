import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { logDebug, logInfo, logWarn } from '../services/logger';

export const execAsync = promisify(exec);

export interface GitRepository {
  repo: string;
  branch?: string;
  include?: string[];
}

/**
 * Check if git is installed and available
 */
export async function isGitInstalled(): Promise<boolean> {
  try {
    await execAsync('git --version');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current branch of a git repository
 */
export async function getCurrentBranch(repoPath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
      cwd: repoPath,
    });
    return stdout.trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logWarn(`Failed to get current branch for ${repoPath}: ${message}`);
    return null;
  }
}

/**
 * Clone a repository to the specified path
 */
export async function cloneRepository(
  repoUrl: string,
  targetPath: string,
  branch?: string,
): Promise<boolean> {
  try {
    // Ensure parent directory exists
    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Build clone command
    const branchFlag = branch ? `--branch ${branch}` : '';
    const cloneCommand = `git clone --depth 1 ${branchFlag} ${repoUrl} ${targetPath}`;

    logDebug(`Cloning repository: ${cloneCommand}`);
    await execAsync(cloneCommand);

    logInfo(`Successfully cloned ${repoUrl} to ${targetPath}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logWarn(`Failed to clone repository ${repoUrl}: ${message}`);
    return false;
  }
}

/**
 * Update an existing repository to the latest commit
 */
export async function updateRepository(repoPath: string): Promise<boolean> {
  try {
    await execAsync('git fetch origin', { cwd: repoPath });
    await execAsync('git reset --hard origin/HEAD', { cwd: repoPath });

    logDebug(`Successfully updated repository at ${repoPath}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logWarn(`Failed to update repository at ${repoPath}: ${message}`);
    return false;
  }
}

/**
 * Switch to a different branch
 */
export async function switchBranch(repoPath: string, branch: string): Promise<boolean> {
  try {
    await execAsync(`git fetch origin ${branch}`, { cwd: repoPath });
    await execAsync(`git checkout ${branch}`, { cwd: repoPath });
    await execAsync(`git reset --hard origin/${branch}`, { cwd: repoPath });

    logInfo(`Successfully switched to branch ${branch} in ${repoPath}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logWarn(`Failed to switch to branch ${branch} in ${repoPath}: ${message}`);
    return false;
  }
}

/**
 * Ensure a repository is up to date
 */
export async function ensureRepositoryUpToDate(
  repository: GitRepository,
  targetPath: string,
): Promise<boolean> {
  const repoUrl = `https://github.com/${repository.repo}.git`;

  // Check if repository directory exists
  if (!fs.existsSync(targetPath)) {
    return await cloneRepository(repoUrl, targetPath, repository.branch);
  }

  // Check if it's a valid git repository
  if (!fs.existsSync(path.join(targetPath, '.git'))) {
    logWarn(`Directory ${targetPath} exists but is not a git repository. Removing and re-cloning.`);
    fs.rmSync(targetPath, { recursive: true, force: true });
    return await cloneRepository(repoUrl, targetPath, repository.branch);
  }

  // Get current branch
  const currentBranch = await getCurrentBranch(targetPath);

  // If branch is specified in config and different from current, switch
  if (repository.branch && currentBranch && repository.branch !== currentBranch) {
    const switched = await switchBranch(targetPath, repository.branch);
    if (!switched) {
      return false;
    }
  }

  // Update to latest
  return await updateRepository(targetPath);
}

/**
 * Get the organization name from a repo string (org/repo format)
 */
export function getOrganizationName(repo: string): string {
  const parts = repo.split('/');
  return parts.length > 1 ? parts[0] : '';
}

/**
 * Get the repository name from a repo string (org/repo format)
 */
export function getRepositoryName(repo: string): string {
  return repo.split('/').pop() || repo;
}

/**
 * Get the full repository path including organization for local storage
 * Returns 'org/repo-name' format for organization-aware storage
 */
export function getRepositoryPath(repo: string): string {
  const parts = repo.split('/');
  if (parts.length > 1) {
    // Return 'org/repo-name' for organization-aware storage
    return repo;
  }
  // For backward compatibility, if no org specified, use just repo name
  return parts[0];
}
