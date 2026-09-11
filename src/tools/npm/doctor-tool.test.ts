import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { DoctorTool, DoctorSchema } from './doctor-tool';
import * as wg from './workspace-graph';
import * as rw from './resolve-workspace';
import type { DoctorIssue, PackageRecord, Workspace } from './workspace-graph';

describe('DoctorTool', () => {
  let tool: DoctorTool;

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

  let spyResolveAndScan: ReturnType<typeof spyOn>;
  let spyRunDoctor: ReturnType<typeof spyOn>;
  let spyCwd: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tool = new DoctorTool();
    spyResolveAndScan = spyOn(rw, 'resolveAndScan');
    spyRunDoctor = spyOn(wg, 'runDoctor');
    spyCwd = spyOn(process, 'cwd').mockReturnValue('/ws');
  });

  afterEach(() => {
    spyResolveAndScan.mockRestore();
    spyRunDoctor.mockRestore();
    spyCwd.mockRestore();
  });

  it('should validate the schema', () => {
    const shape = DoctorSchema.shape;
    expect(Object.keys(shape)).toContain('workspace');
    expect(Object.keys(shape)).toContain('depth');
  });

  it('should return empty array for healthy workspace', async () => {
    spyResolveAndScan.mockReturnValue(fakeWorkspace);
    spyRunDoctor.mockReturnValue([]);

    const result = await tool.execute({});
    const parsed = JSON.parse(result);

    expect(parsed).toEqual([]);
    expect(spyResolveAndScan).toHaveBeenCalledWith(undefined, 1);
    expect(spyRunDoctor).toHaveBeenCalledWith(fakeWorkspace);
  });

  it('should return issues when found', async () => {
    const fakeIssues: DoctorIssue[] = [
      { kind: 'version-drift', from: 'pkg-b', dep: 'pkg-a', declared: '^1.0.0', onDisk: '2.0.0' },
    ];
    spyResolveAndScan.mockReturnValue(fakeWorkspace);
    spyRunDoctor.mockReturnValue(fakeIssues);

    const result = await tool.execute({});
    const parsed = JSON.parse(result);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].kind).toBe('version-drift');
  });

  it('should pass explicit workspace and depth', async () => {
    spyResolveAndScan.mockReturnValue(fakeWorkspace);
    spyRunDoctor.mockReturnValue([]);

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
