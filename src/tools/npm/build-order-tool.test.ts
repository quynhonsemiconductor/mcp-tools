import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { BuildOrderTool, BuildOrderSchema } from './build-order-tool';
import * as wg from './workspace-graph';
import type { BuildOrderResult, PackageRecord, Workspace } from './workspace-graph';

describe('BuildOrderTool', () => {
  let tool: BuildOrderTool;

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

  const fakeLayers: BuildOrderResult[] = [
    { layer: 1, packages: [{ name: 'pkg-a', folder: 'pkg-a', version: '1.0.0', projen: false }] },
  ];

  let spyFindRoot: ReturnType<typeof spyOn>;
  let spyScan: ReturnType<typeof spyOn>;
  let spyBuildOrder: ReturnType<typeof spyOn>;
  let spyCwd: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tool = new BuildOrderTool();
    spyFindRoot = spyOn(wg, 'findWorkspaceRoot');
    spyScan = spyOn(wg, 'scanWorkspace');
    spyBuildOrder = spyOn(wg, 'getBuildOrder');
    spyCwd = spyOn(process, 'cwd').mockReturnValue('/ws');
  });

  afterEach(() => {
    spyFindRoot.mockRestore();
    spyScan.mockRestore();
    spyBuildOrder.mockRestore();
    spyCwd.mockRestore();
  });

  it('should validate the schema', () => {
    const shape = BuildOrderSchema.shape;
    expect(Object.keys(shape)).toContain('package');
    expect(Object.keys(shape)).toContain('workspace');
    expect(Object.keys(shape)).toContain('includeDev');
  });

  it('should auto-detect workspace root and return build order', async () => {
    spyFindRoot.mockReturnValue('/ws');
    spyScan.mockReturnValue(fakeWorkspace);
    spyBuildOrder.mockReturnValue(fakeLayers);

    const result = await tool.execute({ package: 'pkg-a' });
    const parsed = JSON.parse(result);

    expect(parsed).toEqual(fakeLayers);
    expect(spyFindRoot).toHaveBeenCalled();
    expect(spyScan).toHaveBeenCalledWith('/ws', { depth: 1 });
    expect(spyBuildOrder).toHaveBeenCalledWith('pkg-a', fakeWorkspace, { includeDev: false });
  });

  it('should use explicit workspace dir when provided', async () => {
    spyCwd.mockReturnValue('/explicit');
    spyScan.mockReturnValue(fakeWorkspace);
    spyBuildOrder.mockReturnValue(fakeLayers);

    await tool.execute({ package: 'pkg-a', workspace: '/explicit/path' });

    expect(spyFindRoot).not.toHaveBeenCalled();
    expect(spyScan).toHaveBeenCalledWith('/explicit/path', { depth: 1 });
  });

  it('should pass includeDev to getBuildOrder', async () => {
    spyFindRoot.mockReturnValue('/ws');
    spyScan.mockReturnValue(fakeWorkspace);
    spyBuildOrder.mockReturnValue(fakeLayers);

    await tool.execute({ package: 'pkg-a', includeDev: true });

    expect(spyBuildOrder).toHaveBeenCalledWith('pkg-a', fakeWorkspace, { includeDev: true });
  });

  it('should throw when workspace root cannot be detected', async () => {
    spyFindRoot.mockReturnValue(null);

    try {
      await tool.execute({ package: 'pkg-a' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('Could not detect workspace root');
    }
  });

  it('should throw when workspace path is outside allowed directories', async () => {
    spyCwd.mockReturnValue('/safe/dir');

    try {
      await tool.execute({ package: 'pkg-a', workspace: '/etc' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('outside the allowed directory');
    }
  });

  it('should throw when no packages found', async () => {
    spyFindRoot.mockReturnValue('/ws');
    spyScan.mockReturnValue({
      root: '/ws',
      packagesByFolder: new Map(),
      packagesByName: new Map(),
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
