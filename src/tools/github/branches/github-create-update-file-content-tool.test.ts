import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { MockUserError } from '../../../test-utils/mocks';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import {
  GithubCreateUpdateFileContentTool,
  GithubCreateUpdateFileContentToolBaseSchema,
  GithubCreateUpdateFileContentToolParams,
  GithubCreateUpdateFileContentToolSchema,
} from './github-create-update-file-content-tool';

/**
 * Test subclass that overrides resolveBase64Content to avoid filesystem I/O
 * when testing execute() flow (API params, transformation, etc.).
 */
class TestableGithubCreateUpdateFileContentTool extends GithubCreateUpdateFileContentTool {
  mockResolveBase64Content = mock((_args: GithubCreateUpdateFileContentToolParams) => '');

  resolveBase64Content(args: GithubCreateUpdateFileContentToolParams): string {
    return this.mockResolveBase64Content(args);
  }
}

/**
 * Test subclass for validateFilePath and resolveBase64Content tests.
 * Overrides only the protected fs wrappers and getAllowedDirectories,
 * so the real validation and resolution logic is exercised.
 */
class TestableValidationTool extends GithubCreateUpdateFileContentTool {
  allowedDirs: string[] = ['/workspace', '/tmp'];
  mockRealpathSync = mock((p: string) => p);
  mockStatSync = mock(
    (_p: string): { size: number; isDirectory: () => boolean } => ({
      size: 1024,
      isDirectory: () => false,
    }),
  );
  mockReadFileSync = mock((_p: string) => Buffer.from('file content'));

  getAllowedDirectories(): string[] {
    return this.allowedDirs;
  }

  protected realpathSync(p: string): string {
    return this.mockRealpathSync(p);
  }

  protected statSync(p: string): any {
    return this.mockStatSync(p);
  }

  protected readFileSync(p: string): Buffer {
    return this.mockReadFileSync(p);
  }
}

describe('GithubCreateUpdateFileContentTool', () => {
  let tool: GithubCreateUpdateFileContentTool;
  let testableTool: TestableGithubCreateUpdateFileContentTool;

  // Example valid parameters for testing (using inline content)
  const validParams: GithubCreateUpdateFileContentToolParams = {
    org: 'testorg',
    repo: 'test-repo',
    path: '.qnsc/catalog.yaml',
    message: 'Add catalog.yaml file',
    content: 'component:\n  qnsc:\n    ci-id: CI0652708',
    branch: 'main',
    sha: 'dummysha1234567890',
    committer: {
      name: 'Test Committer',
      email: 'committer@example.com',
    },
    author: {
      name: 'Test Author',
      email: 'author@example.com',
    },
  };

  // Example valid parameters using filePath
  const validFilePathParams: GithubCreateUpdateFileContentToolParams = {
    org: 'testorg',
    repo: 'test-repo',
    path: '.qnsc/catalog.yaml',
    message: 'Add catalog.yaml file',
    filePath: '/tmp/catalog.yaml',
    branch: 'main',
    sha: 'dummysha1234567890',
    committer: {
      name: 'Test Committer',
      email: 'committer@example.com',
    },
    author: {
      name: 'Test Author',
      email: 'author@example.com',
    },
  };

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.repos.createOrUpdateFileContents.mockReset();
    mocks.repos.createOrUpdateFileContents.mockImplementation(async () => ({
      data: MOCK_DATA.createOrUpdateFileContentsResponse,
    }));

    // Create fresh instances for each test
    tool = new GithubCreateUpdateFileContentTool();
    testableTool = new TestableGithubCreateUpdateFileContentTool();
    testableTool.mockResolveBase64Content.mockReset();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubCreateUpdateFileContentToolSchema).toBeDefined();

    // Use the base schema for .shape access (ZodEffects from .refine() does not expose .shape)
    const schemaShape = GithubCreateUpdateFileContentToolBaseSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('path');
    expect(Object.keys(schemaShape)).toContain('message');
    expect(Object.keys(schemaShape)).toContain('content');
    expect(Object.keys(schemaShape)).toContain('filePath');
    expect(Object.keys(schemaShape)).toContain('branch');
    expect(Object.keys(schemaShape)).toContain('committer');
    expect(Object.keys(schemaShape)).toContain('author');
  });

  it('should correctly call GitHub API with inline content', async () => {
    await tool.execute(validParams);

    expect(mocks.repos.createOrUpdateFileContents).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = (mocks.repos.createOrUpdateFileContents as any).mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'test-repo',
      path: '.qnsc/catalog.yaml',
      message: 'Add catalog.yaml file',
      content: Buffer.from('component:\n  qnsc:\n    ci-id: CI0652708').toString('base64'),
      branch: 'main',
      sha: 'dummysha1234567890',
      committer: {
        name: 'Test Committer',
        email: 'committer@example.com',
      },
      author: {
        name: 'Test Author',
        email: 'author@example.com',
      },
    } as any);
  });

  it('should pass base64 content through without re-encoding when contentEncoding is base64', async () => {
    const base64ImageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk';
    const params = {
      ...validParams,
      content: base64ImageData,
      contentEncoding: 'base64' as const,
    };

    await tool.execute(params);

    const apiParams = (mocks.repos.createOrUpdateFileContents as any).mock.calls[0][0];
    // base64 content should be passed through as-is, not re-encoded
    expect(apiParams.content).toBe(base64ImageData);
    // contentEncoding should not be sent to the GitHub API
    expect(apiParams.contentEncoding).toBeUndefined();
  });

  it('should correctly call GitHub API with filePath', async () => {
    const fileContent = 'component:\n  qnsc:\n    ci-id: CI0652708';
    const base64Content = Buffer.from(fileContent).toString('base64');
    testableTool.mockResolveBase64Content.mockReturnValue(base64Content);

    await testableTool.execute(validFilePathParams);

    expect(testableTool.mockResolveBase64Content).toHaveBeenCalled();
    expect(mocks.repos.createOrUpdateFileContents).toHaveBeenCalled();

    const apiParams = (mocks.repos.createOrUpdateFileContents as any).mock.calls[0][0];
    expect(apiParams.content).toBe(base64Content);
    // filePath should not be sent to the GitHub API
    expect(apiParams.filePath).toBeUndefined();
  });

  it('should return a JSON string with the file creation data', async () => {
    const result = await tool.execute(validParams);

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.content).toBeDefined();
    expect(parsedResult.content.name).toBe(
      MOCK_DATA.createOrUpdateFileContentsResponse.content.name,
    );
    expect(parsedResult.content.path).toBe(
      MOCK_DATA.createOrUpdateFileContentsResponse.content.path,
    );
    expect(parsedResult.commit).toBeDefined();
    expect(parsedResult.commit.message).toBe(
      MOCK_DATA.createOrUpdateFileContentsResponse.commit.message,
    );
  });

  it('should throw an error when neither content nor filePath is provided', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'test-repo',
        path: '.qnsc/catalog.yaml',
        message: 'Add catalog.yaml file',
        branch: 'main',
        sha: 'dummysha1234567890',
        committer: {
          name: 'Test Committer',
          email: 'committer@example.com',
        },
        author: {
          name: 'Test Author',
          email: 'author@example.com',
        },
      } as any);
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should throw an error for completely invalid input', async () => {
    let error;
    try {
      // Missing all required fields
      await tool.execute({} as any);
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.repos.createOrUpdateFileContents.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute(validParams);
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });

  it('should throw an error when filePath points to a non-existent file', async () => {
    testableTool.mockResolveBase64Content.mockImplementation(() => {
      throw new MockUserError(
        'Tool execution error: Failed to read local file "/tmp/catalog.yaml": ENOENT: no such file or directory',
      );
    });

    let error;
    try {
      await testableTool.execute(validFilePathParams);
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Failed to read local file');
  });

  describe('schema validation', () => {
    it('should validate correct parameters with content', () => {
      const result = GithubCreateUpdateFileContentToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('should validate correct parameters with filePath', () => {
      const result = GithubCreateUpdateFileContentToolSchema.safeParse(validFilePathParams);
      expect(result.success).toBe(true);
    });

    it('should reject when both content and filePath are provided', () => {
      const bothParams = {
        ...validParams,
        filePath: '/tmp/some-file.txt',
      };
      const result = GithubCreateUpdateFileContentToolSchema.safeParse(bothParams);
      expect(result.success).toBe(false);
    });

    it('should reject when neither content nor filePath is provided', () => {
      const { content: _content, ...neitherParams } = validParams;
      const result = GithubCreateUpdateFileContentToolSchema.safeParse(neitherParams);
      expect(result.success).toBe(false);
    });

    it('should reject relative filePath at schema level', () => {
      const params = {
        ...validFilePathParams,
        filePath: '../../../etc/passwd',
      };
      const result = GithubCreateUpdateFileContentToolSchema.safeParse(params);
      expect(result.success).toBe(false);
    });

    it('should reject invalid parameters', () => {
      const invalidParams = {
        org: 'testorg',
        repo: 'test-repo',
        path: 'test.txt',
        message: 'Test message',
        content: 'test content',
        branch: 'main',
        sha: 'dummysha1234567890',
        committer: {
          name: 'Test Committer',
          email: 'invalid-email', // Invalid email format
        },
        author: {
          name: 'Test Author',
          email: 'author@example.com',
        },
      };
      const result = GithubCreateUpdateFileContentToolSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should require all mandatory fields', () => {
      const incompleteParams = {
        org: 'testorg',
        repo: 'test-repo',
        // Missing required fields: owner, path, message, content/filePath, branch, sha, committer, author
      };
      const result = GithubCreateUpdateFileContentToolSchema.safeParse(incompleteParams);
      expect(result.success).toBe(false);
    });

    it('should validate email formats in author and committer', () => {
      const invalidEmailParams = {
        ...validParams,
        author: {
          name: 'Test Author',
          email: 'not-an-email',
        },
      };
      const result = GithubCreateUpdateFileContentToolSchema.safeParse(invalidEmailParams);
      expect(result.success).toBe(false);
    });

    it('should accept valid file paths', () => {
      const validPaths = [
        'README.md',
        'src/components/Button.tsx',
        '.github/workflows/ci.yml',
        'docs/api/index.md',
      ];

      validPaths.forEach((path) => {
        const params = { ...validParams, path };
        const result = GithubCreateUpdateFileContentToolSchema.safeParse(params);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('content handling', () => {
    it('should handle YAML content', () => {
      const yamlContent = `
component:
  qnsc:
    ci-id: CI0652708
    environment: production
`;
      const params = { ...validParams, content: yamlContent };
      const result = GithubCreateUpdateFileContentToolSchema.safeParse(params);
      expect(result.success).toBe(true);
    });

    it('should handle JSON content', () => {
      const jsonContent = JSON.stringify(
        {
          name: 'test-package',
          version: '1.0.0',
          dependencies: {},
        },
        null,
        2,
      );
      const params = {
        ...validParams,
        content: jsonContent,
        path: 'package.json',
      };
      const result = GithubCreateUpdateFileContentToolSchema.safeParse(params);
      expect(result.success).toBe(true);
    });

    it('should handle empty content', () => {
      const params = { ...validParams, content: '' };
      const result = GithubCreateUpdateFileContentToolSchema.safeParse(params);
      expect(result.success).toBe(true);
    });
  });

  describe('API parameter transformation', () => {
    it('should send org as the API owner, and not require it twice', async () => {
      // parseAndTransformGitHubParams maps org to the owner the REST client wants.
      // A separate `owner` in the schema made the organisation a required argument
      // twice under two names, and the call failed unless both were given.
      await tool.execute(validParams);

      const apiParams = (
        mocks.repos.createOrUpdateFileContents as unknown as { mock: { calls: unknown[][] } }
      ).mock.calls[0][0] as Record<string, unknown>;
      expect(apiParams.owner).toBe(validParams.org);
      expect(validParams).not.toHaveProperty('owner');
    });

    it('should not send filePath to the GitHub API', async () => {
      const base64Content = Buffer.from('file-based content').toString('base64');
      testableTool.mockResolveBase64Content.mockReturnValue(base64Content);

      await testableTool.execute(validFilePathParams);

      const apiParams = (mocks.repos.createOrUpdateFileContents as any).mock.calls[0][0];
      expect(apiParams.filePath).toBeUndefined();
      expect(apiParams.content).toBe(base64Content);
    });
  });

  describe('file path validation', () => {
    let validationTool: TestableValidationTool;

    beforeEach(() => {
      validationTool = new TestableValidationTool();
    });

    it('should reject filePath outside allowed directories', () => {
      let error;
      try {
        validationTool.validateFilePath('/etc/passwd');
      } catch (e: any) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('outside allowed directories');
    });

    it('should reject filePath that shares a prefix with an allowed directory', () => {
      // /tmp is allowed, but /tmp-evil is not -- the path.sep in the check matters
      validationTool.allowedDirs = ['/workspace', '/tmp'];
      let error;
      try {
        validationTool.validateFilePath('/tmp-evil/secrets.txt');
      } catch (e: any) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('outside allowed directories');
    });

    it('should allow filePath within CWD and return resolved path', () => {
      const result = validationTool.validateFilePath('/workspace/my-file.txt');
      expect(result).toBe('/workspace/my-file.txt');
    });

    it('should allow filePath within OS temp directory', () => {
      const result = validationTool.validateFilePath('/tmp/upload.png');
      expect(result).toBe('/tmp/upload.png');
    });

    it('should reject filePath when file does not exist', () => {
      const enoent = new Error('ENOENT') as any;
      enoent.code = 'ENOENT';
      validationTool.mockRealpathSync.mockImplementation(() => {
        throw enoent;
      });

      let error;
      try {
        validationTool.validateFilePath('/tmp/nonexistent.txt');
      } catch (e: any) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('File not found');
    });

    it('should report "Cannot access file" when realpathSync throws a non-ENOENT error', () => {
      const eacces = new Error('permission denied') as any;
      eacces.code = 'EACCES';
      validationTool.mockRealpathSync.mockImplementation(() => {
        throw eacces;
      });

      let error;
      try {
        validationTool.validateFilePath('/tmp/locked.txt');
      } catch (e: any) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('Cannot access file');
      expect(error.message).toContain('EACCES');
    });

    it('should reject filePath when statSync fails with permission error', () => {
      const eacces = new Error('permission denied') as any;
      eacces.code = 'EACCES';
      validationTool.mockStatSync.mockImplementation(() => {
        throw eacces;
      });

      let error;
      try {
        validationTool.validateFilePath('/tmp/secret.txt');
      } catch (e: any) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('Cannot read file');
    });

    it('should reject filePath when target is a directory', () => {
      validationTool.mockStatSync.mockReturnValue({
        size: 4096,
        isDirectory: () => true,
      });

      let error;
      try {
        validationTool.validateFilePath('/tmp/some-dir');
      } catch (e: any) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('is a directory, not a file');
    });

    it('should reject filePath when file exceeds size limit', () => {
      validationTool.mockStatSync.mockReturnValue({
        size: 200 * 1024 * 1024,
        isDirectory: () => false,
      });

      let error;
      try {
        validationTool.validateFilePath('/tmp/huge-file.bin');
      } catch (e: any) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('exceeding the 100MB limit');
    });

    it('should allow additional directories via getAllowedDirectories', () => {
      validationTool.allowedDirs = ['/workspace', '/tmp', '/custom/dir'];
      const result = validationTool.validateFilePath('/custom/dir/file.txt');
      expect(result).toBe('/custom/dir/file.txt');
    });

    it('should resolve symlinks before checking allowed directories', () => {
      // Symlink at /tmp/link.txt resolves to /etc/shadow
      validationTool.mockRealpathSync.mockImplementation((p: string) => {
        if (p === '/tmp/link.txt') return '/etc/shadow';
        return p;
      });

      let error;
      try {
        validationTool.validateFilePath('/tmp/link.txt');
      } catch (e: any) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('outside allowed directories');
    });

    it('should reject empty string filePath at schema level', () => {
      const params = {
        ...validFilePathParams,
        filePath: '',
      };
      // Remove content to avoid "both provided" error
      delete (params as any).content;
      const result = GithubCreateUpdateFileContentToolSchema.safeParse(params);
      expect(result.success).toBe(false);
    });
  });

  describe('resolveBase64Content', () => {
    let validationTool: TestableValidationTool;

    beforeEach(() => {
      validationTool = new TestableValidationTool();
    });

    it('should read file and return base64 for filePath', () => {
      const fileBytes = Buffer.from('hello world');
      validationTool.mockReadFileSync.mockReturnValue(fileBytes);

      const result = validationTool.resolveBase64Content({
        ...validFilePathParams,
        filePath: '/tmp/test.txt',
      });

      expect(result).toBe(fileBytes.toString('base64'));
      expect(validationTool.mockRealpathSync).toHaveBeenCalledWith('/tmp/test.txt');
      expect(validationTool.mockReadFileSync).toHaveBeenCalled();
    });

    it('should base64-encode inline text content', () => {
      const result = validationTool.resolveBase64Content({
        ...validParams,
        content: 'plain text',
      });

      expect(result).toBe(Buffer.from('plain text').toString('base64'));
    });

    it('should pass through base64 content when contentEncoding is base64', () => {
      const base64Data = 'aGVsbG8gd29ybGQ=';
      const result = validationTool.resolveBase64Content({
        ...validParams,
        content: base64Data,
        contentEncoding: 'base64',
      });

      expect(result).toBe(base64Data);
    });

    it('should throw when contentEncoding is base64 but content is not valid base64', () => {
      let error;
      try {
        validationTool.resolveBase64Content({
          ...validParams,
          content: 'this is plain text, not base64!!!',
          contentEncoding: 'base64',
        });
      } catch (e: any) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('not valid base64');
    });

    it('should throw when neither content nor filePath is provided', () => {
      let error;
      try {
        validationTool.resolveBase64Content({
          ...validParams,
          content: undefined,
        } as any);
      } catch (e: any) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('Either content or filePath must be provided');
    });

    it('should throw a UserError when readFileSync fails', () => {
      validationTool.mockReadFileSync.mockImplementation(() => {
        throw new Error('I/O error');
      });

      let error;
      try {
        validationTool.resolveBase64Content({
          ...validFilePathParams,
          filePath: '/tmp/broken.txt',
        });
      } catch (e: any) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('Failed to read file');
      expect(error.message).toContain('I/O error');
    });

    it('should ignore contentEncoding when filePath is provided', () => {
      const fileBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header bytes
      validationTool.mockReadFileSync.mockReturnValue(fileBytes);

      const result = validationTool.resolveBase64Content({
        ...validFilePathParams,
        filePath: '/tmp/image.png',
        contentEncoding: 'base64',
      });

      // Should be raw file bytes base64-encoded, not treated as already-base64
      expect(result).toBe(fileBytes.toString('base64'));
    });
  });

  describe('getAllowedDirectories', () => {
    let _validationTool: TestableValidationTool;
    let originalEnv: string | undefined;

    beforeEach(() => {
      // Use a fresh tool that does NOT override getAllowedDirectories
      _validationTool = new TestableValidationTool();
      originalEnv = process.env.QNSC_MCP_ALLOWED_FILE_PATHS;
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.QNSC_MCP_ALLOWED_FILE_PATHS;
      } else {
        process.env.QNSC_MCP_ALLOWED_FILE_PATHS = originalEnv;
      }
    });

    it('should include extra directories from QNSC_MCP_ALLOWED_FILE_PATHS', () => {
      // Create a tool that uses the real getAllowedDirectories but mocked realpathSync
      const envTool = new (class extends GithubCreateUpdateFileContentTool {
        protected realpathSync(p: string): string {
          return p; // identity — don't hit real filesystem
        }
      })();

      process.env.QNSC_MCP_ALLOWED_FILE_PATHS = '/extra/dir, /another/dir';
      const dirs = envTool.getAllowedDirectories();

      expect(dirs).toContain('/extra/dir');
      expect(dirs).toContain('/another/dir');
    });

    it('should handle trailing commas and whitespace in env var', () => {
      const envTool = new (class extends GithubCreateUpdateFileContentTool {
        protected realpathSync(p: string): string {
          return p;
        }
      })();

      process.env.QNSC_MCP_ALLOWED_FILE_PATHS = '/dir1,  /dir2 , , /dir3,';
      const dirs = envTool.getAllowedDirectories();

      expect(dirs).toContain('/dir1');
      expect(dirs).toContain('/dir2');
      expect(dirs).toContain('/dir3');
      // Empty strings from trailing/double commas should be filtered
      expect(dirs).not.toContain('');
    });

    it('should fall back to path.resolve when realpathSync fails for a directory', () => {
      const envTool = new (class extends GithubCreateUpdateFileContentTool {
        protected realpathSync(p: string): string {
          if (p === '/nonexistent/dir') throw new Error('ENOENT');
          return p;
        }
      })();

      process.env.QNSC_MCP_ALLOWED_FILE_PATHS = '/nonexistent/dir';
      const dirs = envTool.getAllowedDirectories();

      // Should still include the directory (resolved via path.resolve fallback)
      const hasNonexistent = dirs.some((d) => d.includes('nonexistent'));
      expect(hasNonexistent).toBe(true);
    });
  });
});
