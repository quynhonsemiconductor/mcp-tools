import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import fs from 'fs';

// Mock the execAsync function using Bun's mock.module
const mockExecAsync = mock(() => Promise.resolve({ stdout: '', stderr: '' }));

// Mock the git module to replace execAsync
void mock.module('./git', () => {
  // Lazy require needed to get the real implementation from inside this self-referential mock.module factory
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const originalModule: typeof import('./git') = require('./git');
  return {
    ...originalModule,
    execAsync: mockExecAsync,
  };
});

// Import functions after mocking
import {
  cloneRepository,
  ensureRepositoryUpToDate,
  getCurrentBranch,
  getOrganizationName,
  getRepositoryName,
  getRepositoryPath,
  isGitInstalled,
  switchBranch,
  updateRepository,
} from './git';

describe('git utilities', () => {
  let existsSpy: any;
  let mkdirSpy: any;
  let rmSpy: any;

  beforeEach(() => {
    // Reset the mock before each test
    mockExecAsync.mockReset();

    existsSpy = spyOn(fs, 'existsSync');
    mkdirSpy = spyOn(fs, 'mkdirSync');
    rmSpy = spyOn(fs, 'rmSync');
  });

  afterEach(() => {
    // Restore all spies
    existsSpy.mockRestore();
    mkdirSpy.mockRestore();
    rmSpy.mockRestore();
  });

  describe('isGitInstalled', () => {
    it('should return true when git is installed', async () => {
      mockExecAsync.mockResolvedValue({
        stdout: 'git version 2.34.1',
        stderr: '',
      });

      const result = await isGitInstalled();
      expect(result).toBe(true);
    });

    it('should return false when git is not installed', async () => {
      mockExecAsync.mockRejectedValue(new Error('command not found'));

      const result = await isGitInstalled();
      expect(result).toBe(false);
    });
  });

  describe('getCurrentBranch', () => {
    it('should return the current branch name', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'main\n', stderr: '' });

      const result = await getCurrentBranch('/test/repo');
      expect(result).toBe('main');
    });

    it('should return null on error', async () => {
      mockExecAsync.mockRejectedValue(new Error('not a git repository'));

      const result = await getCurrentBranch('/test/repo');
      expect(result).toBe(null);
    });
  });

  describe('cloneRepository', () => {
    it('should successfully clone a repository', async () => {
      existsSpy.mockReturnValue(true);
      mockExecAsync.mockResolvedValue({ stdout: 'Cloning...', stderr: '' });

      const result = await cloneRepository(
        'https://github.com/test/repo.git',
        '/test/target',
        'main',
      );

      expect(result).toBe(true);
    });

    it('should create parent directory if it does not exist', async () => {
      existsSpy.mockReturnValue(false);
      mockExecAsync.mockResolvedValue({ stdout: 'Cloning...', stderr: '' });

      await cloneRepository('https://github.com/test/repo.git', '/test/target');

      expect(mkdirSpy).toHaveBeenCalledWith('/test', { recursive: true });
    });

    it('should return false on clone failure', async () => {
      existsSpy.mockReturnValue(true);
      mockExecAsync.mockRejectedValue(new Error('clone failed'));

      const result = await cloneRepository('https://github.com/test/repo.git', '/test/target');

      expect(result).toBe(false);
    });
  });

  describe('updateRepository', () => {
    it('should successfully update a repository', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'Updated', stderr: '' });

      const result = await updateRepository('/test/repo');
      expect(result).toBe(true);
    });

    it('should return false on update failure', async () => {
      mockExecAsync.mockRejectedValue(new Error('update failed'));

      const result = await updateRepository('/test/repo');
      expect(result).toBe(false);
    });
  });

  describe('switchBranch', () => {
    it('should successfully switch branches', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'Switched', stderr: '' });

      const result = await switchBranch('/test/repo', 'feature-branch');
      expect(result).toBe(true);
    });

    it('should return false on switch failure', async () => {
      mockExecAsync.mockRejectedValue(new Error('branch not found'));

      const result = await switchBranch('/test/repo', 'feature-branch');
      expect(result).toBe(false);
    });
  });

  describe('getRepositoryName', () => {
    it('should extract repository name from org/repo format', () => {
      expect(getRepositoryName('myorg/myrepo')).toBe('myrepo');
    });

    it('should handle single name', () => {
      expect(getRepositoryName('myrepo')).toBe('myrepo');
    });

    it('should handle nested org structure', () => {
      expect(getRepositoryName('org/team/myrepo')).toBe('myrepo');
    });
  });

  describe('getOrganizationName', () => {
    it('should extract organization name from org/repo format', () => {
      expect(getOrganizationName('myorg/myrepo')).toBe('myorg');
    });

    it('should return empty string for single name', () => {
      expect(getOrganizationName('myrepo')).toBe('');
    });

    it('should extract first part from nested org structure', () => {
      expect(getOrganizationName('org/team/myrepo')).toBe('org');
    });

    it('should handle empty string', () => {
      expect(getOrganizationName('')).toBe('');
    });
  });

  describe('getRepositoryPath', () => {
    it('should return full path for org/repo format', () => {
      expect(getRepositoryPath('myorg/myrepo')).toBe('myorg/myrepo');
    });

    it('should return single name for backward compatibility', () => {
      expect(getRepositoryPath('myrepo')).toBe('myrepo');
    });

    it('should handle nested org structure', () => {
      expect(getRepositoryPath('org/team/myrepo')).toBe('org/team/myrepo');
    });

    it('should handle empty string', () => {
      expect(getRepositoryPath('')).toBe('');
    });
  });

  describe('ensureRepositoryUpToDate', () => {
    const mockRepository = {
      repo: 'test/repo',
      branch: 'main',
    };

    it('should clone repository if directory does not exist', async () => {
      existsSpy.mockReturnValueOnce(false);
      existsSpy.mockReturnValueOnce(true);
      mockExecAsync.mockImplementation(() =>
        Promise.resolve({ stdout: 'Cloned successfully', stderr: '' }),
      );

      const result = await ensureRepositoryUpToDate(mockRepository, '/test/target');
      expect(result).toBe(true);
    });

    it('should switch branch if different from current', async () => {
      existsSpy.mockReturnValue(true);
      mockExecAsync
        .mockResolvedValueOnce({ stdout: 'develop\n', stderr: '' }) // getCurrentBranch
        .mockResolvedValue({ stdout: 'Success', stderr: '' }); // other commands

      const result = await ensureRepositoryUpToDate(mockRepository, '/test/target');
      expect(result).toBe(true);
    });

    it('should update repository if branch matches', async () => {
      existsSpy.mockReturnValue(true);
      mockExecAsync
        .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }) // getCurrentBranch
        .mockResolvedValue({ stdout: 'Success', stderr: '' }); // other commands

      const result = await ensureRepositoryUpToDate(mockRepository, '/test/target');
      expect(result).toBe(true);
    });
  });
});
