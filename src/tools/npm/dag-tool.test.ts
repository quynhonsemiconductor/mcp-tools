import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { DagTool, DagSchema } from './dag-tool';
import * as wg from './workspace-graph';
import * as rw from './resolve-workspace';
import type { DagNodeResult, PackageRecord, Workspace } from './workspace-graph';

describe('DagTool', () => {
  let tool: DagTool;

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

  const fakeDag: DagNodeResult[] = [
    { name: 'pkg-a', folder: 'pkg-a', version: '1.0.0', dependsOn: [] },
  ];

  let spyResolveAndScan: ReturnType<typeof spyOn>;
  let spyGetDag: ReturnType<typeof spyOn>;
  let spyCwd: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tool = new DagTool();
    spyResolveAndScan = spyOn(rw, 'resolveAndScan');
    spyGetDag = spyOn(wg, 'getDag');
    spyCwd = spyOn(process, 'cwd').mockReturnValue('/ws');
  });

  afterEach(() => {
    spyResolveAndScan.mockRestore();
    spyGetDag.mockRestore();
    spyCwd.mockRestore();
  });

  it('should validate the schema', () => {
    const shape = DagSchema.shape;
    expect(Object.keys(shape)).toContain('package');
    expect(Object.keys(shape)).toContain('workspace');
    expect(Object.keys(shape)).toContain('includeDev');
    expect(Object.keys(shape)).toContain('depth');
  });

  it('should return DAG for a package', async () => {
    spyResolveAndScan.mockReturnValue(fakeWorkspace);
    spyGetDag.mockReturnValue(fakeDag);

    const result = await tool.execute({ package: 'pkg-a' });
    const parsed = JSON.parse(result);

    expect(parsed).toEqual(fakeDag);
    expect(spyResolveAndScan).toHaveBeenCalledWith(undefined, 1);
    expect(spyGetDag).toHaveBeenCalledWith('pkg-a', fakeWorkspace, { includeDev: false });
  });

  it('should pass explicit workspace and depth', async () => {
    spyCwd.mockReturnValue('/explicit');
    spyResolveAndScan.mockReturnValue(fakeWorkspace);
    spyGetDag.mockReturnValue(fakeDag);

    await tool.execute({ package: 'pkg-a', workspace: '/explicit/path', depth: 3 });

    expect(spyResolveAndScan).toHaveBeenCalledWith('/explicit/path', 3);
  });

  it('should pass includeDev to getDag', async () => {
    spyResolveAndScan.mockReturnValue(fakeWorkspace);
    spyGetDag.mockReturnValue(fakeDag);

    await tool.execute({ package: 'pkg-a', includeDev: true });

    expect(spyGetDag).toHaveBeenCalledWith('pkg-a', fakeWorkspace, { includeDev: true });
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
