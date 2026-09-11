import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { ListTool, ListSchema } from './list-tool';
import * as wg from './workspace-graph';
import * as rw from './resolve-workspace';
import type { PackageRecord, Workspace } from './workspace-graph';

describe('ListTool', () => {
  let tool: ListTool;

  const fakeRecords: PackageRecord[] = [
    {
      folder: 'alpha',
      name: 'alpha',
      version: '1.0.0',
      path: '/ws/alpha',
      dependencies: {},
      devDependencies: {},
      projen: false,
    },
    {
      folder: 'beta',
      name: 'beta',
      version: '2.0.0',
      path: '/ws/beta',
      dependencies: {},
      devDependencies: {},
      projen: true,
    },
  ];

  const fakeWorkspace: Workspace = {
    root: '/ws',
    packagesByFolder: new Map(fakeRecords.map((r) => [r.folder, r])),
    packagesByName: new Map(fakeRecords.map((r) => [r.name, r])),
  };

  let spyResolveAndScan: ReturnType<typeof spyOn>;
  let spyListPackages: ReturnType<typeof spyOn>;
  let spyCwd: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tool = new ListTool();
    spyResolveAndScan = spyOn(rw, 'resolveAndScan');
    spyListPackages = spyOn(wg, 'listPackages');
    spyCwd = spyOn(process, 'cwd').mockReturnValue('/ws');
  });

  afterEach(() => {
    spyResolveAndScan.mockRestore();
    spyListPackages.mockRestore();
    spyCwd.mockRestore();
  });

  it('should validate the schema', () => {
    const shape = ListSchema.shape;
    expect(Object.keys(shape)).toContain('workspace');
    expect(Object.keys(shape)).toContain('depth');
  });

  it('should return package list with name, folder, version, projen', async () => {
    spyResolveAndScan.mockReturnValue(fakeWorkspace);
    spyListPackages.mockReturnValue(fakeRecords);

    const result = await tool.execute({});
    const parsed = JSON.parse(result);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ name: 'alpha', folder: 'alpha', version: '1.0.0', projen: false });
    expect(parsed[1]).toEqual({ name: 'beta', folder: 'beta', version: '2.0.0', projen: true });
    expect(spyResolveAndScan).toHaveBeenCalledWith(undefined, 1);
  });

  it('should pass explicit workspace and depth', async () => {
    spyResolveAndScan.mockReturnValue(fakeWorkspace);
    spyListPackages.mockReturnValue(fakeRecords);

    await tool.execute({ workspace: '/ws', depth: 2 });

    expect(spyResolveAndScan).toHaveBeenCalledWith('/ws', 2);
  });

  it('should throw when workspace root cannot be detected', async () => {
    spyResolveAndScan.mockImplementation(() => {
      throw new Error('Could not detect workspace root. Provide the workspace parameter.');
    });

    try {
      await tool.execute({});
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
      await tool.execute({ workspace: '/etc' });
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
      await tool.execute({});
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('No packages found');
    }
  });
});
