import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { logWarn } from '../../../services/logger';
import { CatchErrors, UserError } from '../../../utils';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB — matches GitHub's file size limit

/**
 * Minimal shape of a Node.js system/filesystem error (subset of NodeJS.ErrnoException).
 * Only the fields this tool reads are declared.
 */
interface FileSystemError {
  code?: string;
  message?: string;
}

/** Narrow an unknown thrown value to the fields we read off a Node fs error. */
function asFileSystemError(err: unknown): FileSystemError {
  if (typeof err === 'object' && err !== null) {
    const e = err as { code?: unknown; message?: unknown };
    return {
      code: typeof e.code === 'string' ? e.code : undefined,
      message: typeof e.message === 'string' ? e.message : undefined,
    };
  }
  return {};
}

/**
 * Base schema definition for the createOrUpdateGithubFileContent tool parameters.
 * Exported separately so tests can access .shape (ZodEffects from .refine() does not expose .shape).
 */
export const GithubCreateUpdateFileContentToolBaseSchema = createGithubBaseSchema({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  path: z.string().describe('The file path in the repository'),
  message: z.string().describe('The commit message'),
  content: z
    .string()
    .optional()
    .describe(
      'Plain text file content. Do NOT base64-encode — the tool encodes automatically. Best for small files. Mutually exclusive with filePath.',
    ),
  contentEncoding: z
    .enum(['text', 'base64'])
    .optional()
    .default('text')
    .describe(
      'Leave as default "text" in almost all cases. Only set to "base64" if the content is already base64-encoded binary data from another tool. Does not apply when using filePath.',
    ),
  filePath: z
    .string()
    .min(1)
    .refine((p) => path.isAbsolute(p), { message: 'filePath must be an absolute path' })
    .optional()
    .describe(
      'Absolute path to a local file to upload. Preferred for large files or binary content (images, archives, etc.) to avoid bloating the context. The tool reads and encodes the file automatically. Mutually exclusive with content.',
    ),
  branch: z.string().describe('The branch name'),
  sha: z.string().describe('The blob SHA of the file being replaced.'),
  committer: z
    .object({
      name: z.string().describe('The name of the committer'),
      email: z.string().email().describe('The email of the committer'),
    })
    .describe('The committer information'),
  author: z
    .object({
      name: z.string().describe('The name of the author'),
      email: z.string().email().describe('The email of the author'),
    })
    .describe('The author information'),
});

/**
 * Refined schema that enforces exactly one of content or filePath must be provided.
 */
export const GithubCreateUpdateFileContentToolSchema =
  GithubCreateUpdateFileContentToolBaseSchema.refine(
    (data) => (data.content !== undefined) !== (data.filePath !== undefined),
    { message: 'Exactly one of "content" or "filePath" must be provided' },
  );

/**
 * Type for the createOrUpdateGithubFileContent tool parameters
 */
export type GithubCreateUpdateFileContentToolParams = z.input<
  typeof GithubCreateUpdateFileContentToolSchema
>;

/**
 * createOrUpdateGithubFileContent - Creates or updates file content in a branch.
 * Supports reading content from a local file path to avoid large inline content.
 */
@Tool({
  id: 'github-create-update-file-content',
  name: 'createOrUpdateGithubFileContent',
  description:
    'Creates or updates a file in a branch. Accepts plain text via content or a local file path via filePath. Do NOT base64-encode anything — the tool handles all encoding internally.',
  category: 'Github: Branches',
  parameters: GithubCreateUpdateFileContentToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.1.0',
  annotations: {
    title: 'Create or Update Github File Content',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubCreateUpdateFileContentTool extends GithubBaseTool {
  /** Resolve a path's real location (follows symlinks). Overridable for testing. */
  protected realpathSync(p: string): string {
    return fs.realpathSync(p);
  }

  /** Get file metadata. Overridable for testing. */
  protected statSync(p: string): fs.Stats {
    return fs.statSync(p);
  }

  /** Read file contents as a Buffer. Overridable for testing. */
  protected readFileSync(p: string): Buffer {
    return fs.readFileSync(p);
  }

  /**
   * Returns the list of directories that filePath is allowed to read from.
   * Defaults to CWD and OS temp dir. Additional dirs can be added via
   * the QNSC_MCP_ALLOWED_FILE_PATHS env var (comma-separated absolute paths).
   */
  getAllowedDirectories(): string[] {
    const dirs = [process.cwd(), os.tmpdir()];

    const extra = process.env.QNSC_MCP_ALLOWED_FILE_PATHS;
    if (extra) {
      dirs.push(
        ...extra
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean),
      );
    }

    // Resolve all dirs to their real paths (follows symlinks, normalizes)
    return dirs.map((d) => {
      try {
        return this.realpathSync(d);
      } catch (err: unknown) {
        const e = asFileSystemError(err);
        if (e.code !== 'ENOENT') {
          logWarn(`Could not resolve allowed directory "${d}": ${e.code || e.message}`);
        }
        return path.resolve(d);
      }
    });
  }

  /**
   * Validates that a file path is within allowed directories, exists,
   * and is within the size limit. Resolves symlinks before checking.
   */
  validateFilePath(filePath: string): string {
    let resolvedPath: string;
    try {
      resolvedPath = this.realpathSync(filePath);
    } catch (err: unknown) {
      const e = asFileSystemError(err);
      if (e.code === 'ENOENT') {
        throw new UserError(`File not found: "${filePath}"`);
      }
      throw new UserError(`Cannot access file "${filePath}": ${e.code || e.message}`);
    }

    const allowedDirs = this.getAllowedDirectories();
    const isAllowed = allowedDirs.some(
      (dir) => resolvedPath.startsWith(dir + path.sep) || resolvedPath === dir,
    );
    if (!isAllowed) {
      throw new UserError(
        `File path "${filePath}" is outside allowed directories. ` +
          `Set QNSC_MCP_ALLOWED_FILE_PATHS to add additional directories.`,
      );
    }

    let stat: ReturnType<typeof fs.statSync>;
    try {
      stat = this.statSync(resolvedPath);
    } catch (err: unknown) {
      throw new UserError(`Cannot read file "${filePath}": ${asFileSystemError(err).message}`);
    }

    if (stat.isDirectory()) {
      throw new UserError(`"${filePath}" is a directory, not a file`);
    }

    if (stat.size > MAX_FILE_SIZE_BYTES) {
      throw new UserError(
        `File "${filePath}" is ${(stat.size / 1024 / 1024).toFixed(1)}MB, ` +
          `exceeding the 100MB limit.`,
      );
    }

    return resolvedPath;
  }

  /**
   * Resolve file content as base64. Reads binary-safe from filePath,
   * or base64-encodes inline text content.
   */
  resolveBase64Content(args: GithubCreateUpdateFileContentToolParams): string {
    if (args.filePath) {
      const resolvedPath = this.validateFilePath(args.filePath);
      try {
        return this.readFileSync(resolvedPath).toString('base64');
      } catch (err: unknown) {
        throw new UserError(
          `Failed to read file "${args.filePath}": ${asFileSystemError(err).message}`,
        );
      }
    }

    if (args.content !== undefined) {
      if (args.contentEncoding === 'base64') {
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(args.content) || args.content.length % 4 !== 0) {
          throw new UserError(
            'content is not valid base64. Either encode it correctly or set contentEncoding to "text".',
          );
        }
        return args.content;
      }
      return Buffer.from(args.content).toString('base64');
    }

    throw new UserError('Either content or filePath must be provided');
  }

  /**
   * Execute the tool
   */
  @CatchErrors()
  async execute(args: GithubCreateUpdateFileContentToolParams): Promise<string> {
    const {
      filePath: _filePath,
      contentEncoding: _contentEncoding,
      ...githubParams
    } = parseAndTransformGitHubParams(GithubCreateUpdateFileContentToolSchema, args);

    githubParams.content = this.resolveBase64Content(args);

    const client = this.getClient();
    type CreateOrUpdateParams = Parameters<
      typeof client.rest.repos.createOrUpdateFileContents
    >[0];

    return this.cleanResponse(
      await client.rest.repos.createOrUpdateFileContents(
        githubParams as CreateOrUpdateParams,
      ),
    );
  }
}
