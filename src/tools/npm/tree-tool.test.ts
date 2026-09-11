import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { TreeTool } from './tree-tool';
import * as wg from './workspace-graph';
import * as rw from './resolve-workspace';
import type { TreeNodeResult, PackageRecord, Workspace } from './workspace-graph';

describe('TreeTool', () => {
  let tool: TreeTool;

  const fakePackageRecord: PackageRecord = {
    folder: 'pkg-a',
    name: 'pkg-a',
    version: '1.0.0',
    path: '/ws/pkg-a',
    dependencies: {},
    devDependencies: {},
    projen: false,
  };

  const fakeWorkspace: Workspace = {
    root: '/ws',
    packagesByFolder: new Map([['pkg-a', fakePackageRecord]]),
    packagesByName: new Map([['pkg-a', fakePackageRecord]]),
  };

  const fakeTree: TreeNodeResult = {
    name: 'pkg-a',
    folder: 'pkg-a',
    version: '1.0.0',
    owned: true,
    cycle: false,
    children: [],
  };

  let spyResolveAndScan: ReturnType<typeof spyOn>;
  let spyGetTree: ReturnType<typeof spyOn>;
  let spyCwd: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tool = new TreeTool();
    spyResolveAndScan = spyOn(rw, 'resolveAndScan');
    spyGetTree = spyOn(wg, 'getTree');
    spyCwd = spyOn(process, 'cwd').mockReturnValue('/ws');
  });

  afterEach(() => {
    spyResolveAndScan.mockRestore();
    spyGetTree.mockRestore();
    spyCwd.mockRestore();
  });

  it('should return tree for a package', async () => {
    spyResolveAndScan.mockReturnValue(fakeWorkspace);
    spyGetTree.mockReturnValue(fakeTree);

    const result = await tool.execute({ package: 'pkg-a' });
    const parsed = JSON.parse(result);

    expect(parsed).toEqual(fakeTree);
    expect(spyResolveAndScan).toHaveBeenCalledWith(undefined, 1);
    expect(spyGetTree).toHaveBeenCalledWith('pkg-a', fakeWorkspace, {
      includeDev: false,
      owned: false,
      external: false,
    });
  });

  it('should pass owned flag', async () => {
    spyResolveAndScan.mockReturnValue(fakeWorkspace);
    spyGetTree.mockReturnValue(fakeTree);

    await tool.execute({ package: 'pkg-a', owned: true });

    expect(spyGetTree).toHaveBeenCalledWith('pkg-a', fakeWorkspace, {
      includeDev: false,
      owned: true,
      external: false,
    });
  });

  it('should pass external flag', async () => {
    spyResolveAndScan.mockReturnValue(fakeWorkspace);
    spyGetTree.mockReturnValue(fakeTree);

    await tool.execute({ package: 'pkg-a', external: true });

    expect(spyGetTree).toHaveBeenCalledWith('pkg-a', fakeWorkspace, {
      includeDev: false,
      owned: false,
      external: true,
    });
  });

  it('should reject owned and external together', async () => {
    try {
      await tool.execute({ package: 'pkg-a', owned: true, external: true });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('owned and external are mutually exclusive');
    }
  });

  it('should pass explicit workspace and depth', async () => {
    spyResolveAndScan.mockReturnValue(fakeWorkspace);
    spyGetTree.mockReturnValue(fakeTree);

    await tool.execute({ package: 'pkg-a', workspace: '/ws', depth: 2 });

    expect(spyResolveAndScan).toHaveBeenCalledWith('/ws', 2);
  });

  it('should pass includeDev to getTree', async () => {
    spyResolveAndScan.mockReturnValue(fakeWorkspace);
    spyGetTree.mockReturnValue(fakeTree);

    await tool.execute({ package: 'pkg-a', includeDev: true });

    expect(spyGetTree).toHaveBeenCalledWith('pkg-a', fakeWorkspace, {
      includeDev: true,
      owned: false,
      external: false,
    });
  });

  it('should throw when workspace root cannot be detected', async () => {
    spyResolveAndScan.mockImplementation(() => {
      throw new Error('Could not detect workspace root. Provide the workspace parameter.');
    });

    try {
      await tool.execute({ package: 'pkg-a' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('Could not detect workspace root');
    }
  });

  it('should throw when workspace path is outside allowed directories', async () => {
    spyResolveAndScan.mockImplementation(() => {
      throw new Error('Workspace path is outside the allowed directory.');
    });

    try {
      await tool.execute({ package: 'pkg-a', workspace: '/etc' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('outside the allowed directory');
    }
  });

  it('should throw when no packages found', async () => {
    spyResolveAndScan.mockImplementation(() => {
      throw new Error('No packages found in the specified workspace.');
    });

    try {
      await tool.execute({ package: 'pkg-a' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('No packages found');
    }
  });
});
