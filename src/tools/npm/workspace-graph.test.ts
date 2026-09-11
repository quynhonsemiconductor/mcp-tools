import { afterEach, beforeEach, describe, expect, it, type Mock } from 'bun:test';
import fs from 'node:fs';
import {
  type Workspace,
  type PackageRecord,
  type TreeNodeResult,
  type DagNodeResult,
  getBuildOrder,
  getTree,
  getDag,
  runDoctor,
  listPackages,
  scanWorkspace,
} from './workspace-graph';

const WORKSPACE = '/test-workspace';

function makeRecord(
  folder: string,
  opts: {
    name?: string;
    version?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    projen?: boolean;
  } = {},
): PackageRecord {
  return {
    folder,
    name: opts.name ?? folder,
    version: opts.version ?? '1.0.0',
    path: `${WORKSPACE}/${folder}`,
    dependencies: opts.dependencies ?? {},
    devDependencies: opts.devDependencies ?? {},
    projen: opts.projen ?? false,
  };
}

function makeWorkspace(records: PackageRecord[]): Workspace {
  const packagesByFolder = new Map<string, PackageRecord>();
  const packagesByName = new Map<string, PackageRecord>();
  for (const r of records) {
    packagesByFolder.set(r.folder, r);
    packagesByName.set(r.name, r);
  }
  return { root: WORKSPACE, packagesByFolder, packagesByName };
}

describe('workspace-graph', () => {
  it('should return layers for a simple chain', () => {
    const ws = makeWorkspace([
      makeRecord('pkg-a'),
      makeRecord('pkg-b', { dependencies: { 'pkg-a': '^1.0.0' } }),
      makeRecord('pkg-c', { dependencies: { 'pkg-b': '^1.0.0' } }),
    ]);
    const layers = getBuildOrder('pkg-c', ws);
    expect(layers).toHaveLength(3);
    expect(layers[0].layer).toBe(1);
    expect(layers[0].packages[0].name).toBe('pkg-a');
    expect(layers[1].packages[0].name).toBe('pkg-b');
    expect(layers[2].packages[0].name).toBe('pkg-c');
  });

  it('should group parallel packages in the same layer', () => {
    const ws = makeWorkspace([
      makeRecord('base'),
      makeRecord('left-a', { dependencies: { base: '^1.0.0' } }),
      makeRecord('left-b', { dependencies: { base: '^1.0.0' } }),
      makeRecord('top', { dependencies: { 'left-a': '^1.0.0', 'left-b': '^1.0.0' } }),
    ]);
    const layers = getBuildOrder('top', ws);
    expect(layers).toHaveLength(3);
    expect(layers[0].packages).toHaveLength(1);
    expect(layers[1].packages).toHaveLength(2);
    expect(layers[1].packages.map((p) => p.name).sort()).toEqual(['left-a', 'left-b']);
    expect(layers[2].packages[0].name).toBe('top');
  });

  it('should detect projen packages', () => {
    const ws = makeWorkspace([
      makeRecord('pkg-a', { projen: true }),
      makeRecord('pkg-b', { dependencies: { 'pkg-a': '^1.0.0' }, projen: false }),
    ]);
    const layers = getBuildOrder('pkg-b', ws);
    expect(layers[0].packages[0].projen).toBe(true);
    expect(layers[1].packages[0].projen).toBe(false);
  });

  it('should throw for unknown package', () => {
    const ws = makeWorkspace([makeRecord('pkg-a'), makeRecord('pkg-b'), makeRecord('pkg-c')]);
    expect(() => getBuildOrder('nonexistent', ws)).toThrow('Package not found: nonexistent');
  });

  it('should detect a cycle and throw', () => {
    const ws = makeWorkspace([
      makeRecord('pkg-a', { dependencies: { 'pkg-b': '^1.0.0' } }),
      makeRecord('pkg-b', { dependencies: { 'pkg-a': '^1.0.0' } }),
    ]);
    expect(() => getBuildOrder('pkg-a', ws)).toThrow('Cycle detected');
  });

  it('should include devDependencies when includeDev is true', () => {
    const ws = makeWorkspace([
      makeRecord('shared'),
      makeRecord('app', { devDependencies: { shared: '^1.0.0' } }),
    ]);

    const without = getBuildOrder('app', ws);
    expect(without).toHaveLength(1);
    expect(without[0].packages[0].name).toBe('app');

    const withDev = getBuildOrder('app', ws, { includeDev: true });
    expect(withDev).toHaveLength(2);
    expect(withDev[0].packages[0].name).toBe('shared');
    expect(withDev[1].packages[0].name).toBe('app');
  });

  it('should resolve by folder name or package name', () => {
    const ws = makeWorkspace([
      makeRecord('my-folder', { name: '@scope/my-package', version: '2.0.0' }),
      makeRecord('dep'),
      makeRecord('consumer', { dependencies: { '@scope/my-package': '^2.0.0' } }),
    ]);

    const l1 = getBuildOrder('my-folder', ws);
    expect(l1[0].packages[0].name).toBe('@scope/my-package');

    const l2 = getBuildOrder('@scope/my-package', ws);
    expect(l2[0].packages[0].name).toBe('@scope/my-package');

    const l3 = getBuildOrder('consumer', ws);
    expect(l3).toHaveLength(2);
    expect(l3[0].packages[0].name).toBe('@scope/my-package');
    expect(l3[1].packages[0].name).toBe('consumer');
  });
});

describe('getTree', () => {
  it('should return a recursive tree with owned and external deps', () => {
    const ws = makeWorkspace([
      makeRecord('base'),
      makeRecord('mid', { dependencies: { base: '^1.0.0' } }),
      makeRecord('top', { dependencies: { mid: '^1.0.0', lodash: '^4.0.0' } }),
    ]);
    const tree = getTree('top', ws);
    expect(tree.name).toBe('top');
    expect(tree.children).toHaveLength(2);
    const lodash = tree.children.find((c: TreeNodeResult) => c.name === 'lodash');
    expect(lodash!.owned).toBe(false);
    const mid = tree.children.find((c: TreeNodeResult) => c.name === 'mid');
    expect(mid!.owned).toBe(true);
    expect(mid!.children[0].name).toBe('base');
  });

  it('should filter to owned-only', () => {
    const ws = makeWorkspace([
      makeRecord('base'),
      makeRecord('top', { dependencies: { base: '^1.0.0', lodash: '^4.0.0' } }),
    ]);
    const tree = getTree('top', ws, { owned: true });
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].name).toBe('base');
  });

  it('should filter to external-only', () => {
    const ws = makeWorkspace([
      makeRecord('base'),
      makeRecord('top', { dependencies: { base: '^1.0.0', lodash: '^4.0.0' } }),
    ]);
    const tree = getTree('top', ws, { external: true });
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].name).toBe('lodash');
  });
});

describe('getDag', () => {
  it('should return unique owned nodes with edges', () => {
    const ws = makeWorkspace([
      makeRecord('base'),
      makeRecord('mid', { dependencies: { base: '^1.0.0' } }),
      makeRecord('top', { dependencies: { mid: '^1.0.0', base: '^1.0.0' } }),
    ]);
    const dag = getDag('top', ws);
    expect(dag).toHaveLength(3);
    const top = dag.find((n: DagNodeResult) => n.name === 'top')!;
    expect(top.dependsOn.sort()).toEqual(['base', 'mid']);
    const mid = dag.find((n: DagNodeResult) => n.name === 'mid')!;
    expect(mid.dependsOn).toEqual(['base']);
    const base = dag.find((n: DagNodeResult) => n.name === 'base')!;
    expect(base.dependsOn).toEqual([]);
  });
});

describe('runDoctor', () => {
  it('should return empty array for healthy workspace', () => {
    const ws = makeWorkspace([
      makeRecord('pkg-a', { version: '1.0.0' }),
      makeRecord('pkg-b', { version: '2.0.0', dependencies: { 'pkg-a': '^1.0.0' } }),
    ]);
    const issues = runDoctor(ws);
    expect(issues).toEqual([]);
  });

  it('should detect version drift', () => {
    const ws = makeWorkspace([
      makeRecord('pkg-a', { version: '2.0.0' }),
      makeRecord('pkg-b', { dependencies: { 'pkg-a': '^1.0.0' } }),
    ]);
    const issues = runDoctor(ws);
    expect(issues).toHaveLength(1);
    const drift = issues[0];
    expect(drift.kind).toBe('version-drift');
    if (drift.kind === 'version-drift') {
      expect(drift.dep).toBe('pkg-a');
      expect(drift.declared).toBe('^1.0.0');
      expect(drift.onDisk).toBe('2.0.0');
    }
  });

  it('should detect cycles', () => {
    const ws = makeWorkspace([
      makeRecord('pkg-a', { dependencies: { 'pkg-b': '^1.0.0' } }),
      makeRecord('pkg-b', { dependencies: { 'pkg-a': '^1.0.0' } }),
    ]);
    const issues = runDoctor(ws);
    const cycleIssue = issues.find((i) => i.kind === 'cycle');
    expect(cycleIssue).toBeDefined();
    if (cycleIssue && cycleIssue.kind === 'cycle') {
      expect(cycleIssue.cycle).toContain('pkg-a');
      expect(cycleIssue.cycle).toContain('pkg-b');
    }
  });

  it('should skip 0.0.0 versions in drift check', () => {
    const ws = makeWorkspace([
      makeRecord('pkg-a', { version: '0.0.0' }),
      makeRecord('pkg-b', { dependencies: { 'pkg-a': '^5.0.0' } }),
    ]);
    const issues = runDoctor(ws);
    expect(issues).toEqual([]);
  });
});

describe('listPackages', () => {
  it('should return packages sorted by folder', () => {
    const ws = makeWorkspace([makeRecord('zebra'), makeRecord('alpha'), makeRecord('mid')]);
    const list = listPackages(ws);
    expect(list.map((p) => p.folder)).toEqual(['alpha', 'mid', 'zebra']);
  });
});

describe('scanWorkspace depth', () => {
  const ROOT = '/test-ws';

  // Simulate:
  //   /test-ws/pkg-a/package.json         → { name: "pkg-a", version: "1.0.0" }
  //   /test-ws/pkg-a/.projenrc.ts         → exists
  //   /test-ws/pkg-a/test-app/package.json → { name: "test-app", ..., deps: { pkg-a } }
  const dirEntries: Record<string, { name: string; isDirectory: () => boolean }[]> = {
    [ROOT]: [{ name: 'pkg-a', isDirectory: () => true }],
    [`${ROOT}/pkg-a`]: [
      { name: 'package.json', isDirectory: () => false },
      { name: '.projenrc.ts', isDirectory: () => false },
      { name: 'test-app', isDirectory: () => true },
    ],
    [`${ROOT}/pkg-a/test-app`]: [{ name: 'package.json', isDirectory: () => false }],
  };

  const files: Record<string, string> = {
    [`${ROOT}/pkg-a/package.json`]: JSON.stringify({ name: 'pkg-a', version: '1.0.0' }),
    [`${ROOT}/pkg-a/test-app/package.json`]: JSON.stringify({
      name: 'test-app',
      version: '0.0.0',
      dependencies: { 'pkg-a': '^1.0.0' },
    }),
  };

  const existsPaths = new Set([
    `${ROOT}/pkg-a/package.json`,
    `${ROOT}/pkg-a/.projenrc.ts`,
    `${ROOT}/pkg-a/test-app/package.json`,
  ]);

  const mockReaddirSync = fs.readdirSync as unknown as Mock<
    (dir: string) => { name: string; isDirectory: () => boolean }[]
  >;
  const mockExistsSync = fs.existsSync as unknown as Mock<(p: string) => boolean>;
  const mockReadFileSync = fs.readFileSync as unknown as Mock<(p: string) => string>;

  beforeEach(() => {
    mockReaddirSync.mockImplementation((dir: string) => dirEntries[dir] ?? []);
    mockExistsSync.mockImplementation((p: string) => existsPaths.has(p));
    mockReadFileSync.mockImplementation((p: string) => files[p] ?? '');
  });

  afterEach(() => {
    mockReaddirSync.mockReset();
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
  });

  it('should only find top-level packages at depth 1', () => {
    const ws = scanWorkspace(ROOT, { depth: 1 });
    expect(ws.packagesByName.has('pkg-a')).toBe(true);
    expect(ws.packagesByName.has('test-app')).toBe(false);
  });

  it('should find nested packages at depth 2', () => {
    const ws = scanWorkspace(ROOT, { depth: 2 });
    expect(ws.packagesByName.has('pkg-a')).toBe(true);
    expect(ws.packagesByName.has('test-app')).toBe(true);
    expect(ws.packagesByName.get('test-app')!.folder).toBe('pkg-a/test-app');
  });

  it('should detect projen in nested scan', () => {
    const ws = scanWorkspace(ROOT, { depth: 2 });
    expect(ws.packagesByName.get('pkg-a')!.projen).toBe(true);
    expect(ws.packagesByName.get('test-app')!.projen).toBe(false);
  });

  it('should produce correct build order with nested package', () => {
    const ws = scanWorkspace(ROOT, { depth: 2 });
    const layers = getBuildOrder('test-app', ws);
    expect(layers).toHaveLength(2);
    expect(layers[0].packages[0].name).toBe('pkg-a');
    expect(layers[1].packages[0].name).toBe('test-app');
  });
});
