/**
 * repo-cloner.ts - Git repository cloning utilities for MCP bundling
 *
 * This module provides functionality for cloning git repositories and checking out
 * specific tags or branches for MCP bundling.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CloneResult, GitRepoSource } from '../types';

/**
 * Utility class for cloning git repositories
 */
export class RepoCloner {
  /**
   * Check if git is installed on the system
   * @returns Whether git is installed
   */
  public static isGitInstalled(): boolean {
    try {
      execSync('git --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clone a git repository and checkout a specific ref
   * @param source Repository source
   * @param verbose Whether to show verbose output
   * @returns Clone result
   */
  // Kept async: repo-cloner.test.ts subclasses this with an async override, so the base
  // signature must stay Promise-returning.
  // eslint-disable-next-line @typescript-eslint/require-await
  public static async cloneRepo(
    source: GitRepoSource | string,
    verbose: boolean = false,
  ): Promise<CloneResult> {
    if (typeof source === 'string') {
      if (fs.existsSync(source)) {
        return {
          path: source,
          success: true,
          shouldCleanup: false,
        };
      } else {
        return {
          path: source,
          success: false,
          error: `Local directory does not exist: ${source}`,
          shouldCleanup: false,
        };
      }
    }

    if (!this.isGitInstalled()) {
      return {
        path: '',
        success: false,
        error: 'Git is not installed on this system. Please install git to clone repositories.',
        shouldCleanup: false,
      };
    }

    const { url, ref } = source;

    if (!url) {
      return {
        path: '',
        success: false,
        error: 'Repository URL is required',
        shouldCleanup: false,
      };
    }

    if (!ref) {
      return {
        path: '',
        success: false,
        error: 'Repository ref (tag, branch, or commit) is required',
        shouldCleanup: false,
      };
    }

    // Create a temporary directory
    const tempDir = path.join(os.tmpdir(), `mcp-clone-${uuidv4()}`);

    try {
      // Ensure the temporary directory exists
      fs.mkdirSync(tempDir, { recursive: true });

      console.log(`🔄 Cloning repository: ${url}@${ref}`);

      // First, clone the repository (without specifying branch/tag)
      execSync(`git clone --quiet ${url} .`, {
        cwd: tempDir,
        stdio: verbose ? 'inherit' : 'ignore',
      });

      // Then checkout the specific ref (branch, tag, or commit)
      execSync(`git checkout --quiet ${ref}`, {
        cwd: tempDir,
        stdio: verbose ? 'inherit' : 'ignore',
      });

      // Extract workingDir from source if available
      const workingDir = source.workingDir ? path.join(tempDir, source.workingDir) : tempDir;

      // Check if the working directory exists
      if (source.workingDir && !fs.existsSync(workingDir)) {
        console.warn(
          `⚠️ Specified workingDir '${source.workingDir}' does not exist in the cloned repository at ${tempDir}.`,
        );
      }

      return {
        path: tempDir,
        success: true,
        shouldCleanup: true,
        workingDir: source.workingDir ? workingDir : undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Error cloning repository: ${message}`);
      return {
        path: tempDir,
        success: false,
        error: `Failed to clone repository: ${message}`,
        shouldCleanup: true,
      };
    }
  }

  /**
   * Clean up a cloned repository
   * @param cloneResult Clone result to clean up
   */
  public static cleanup(cloneResult: CloneResult): void {
    if (cloneResult.shouldCleanup && cloneResult.success && fs.existsSync(cloneResult.path)) {
      fs.rmSync(cloneResult.path, { recursive: true, force: true });
    }
  }
}
