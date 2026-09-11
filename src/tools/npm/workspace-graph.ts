import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';

// ---------- types ----------

export interface PackageRecord {
  folder: string;
  name: string;
  version: string | null;
  path: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  projen: boolean;
}

export interface Workspace {
  root: string;
  packagesByFolder: Map<string, PackageRecord>;
  packagesByName: Map<string, PackageRecord>;
}

interface TreeNode {
  name: string;
  folder: string;
  version: string | null;
  owned: boolean;
  cycle: boolean;
  children: TreeNode[];
}

export interface TreeNodeResult {
  name: string;
  folder: string;
  version: string | null;
  owned: boolean;
  cycle: boolean;
  children: TreeNodeResult[];
}

interface DagNode {
  name: string;
  folder: string;
  version: string | null;
  outgoing: Set<string>;
}

export interface DagNodeResult {
  name: string;
  folder: string;
  version: string | null;
  dependsOn: string[];
}

export type DoctorIssue =
  | { kind: 'version-drift'; from: string; dep: string; declared: string; onDisk: string }
  | { kind: 'cycle'; cycle: string[] };

export interface LayerPackage {
  name: string;
  folder: string;
  version: string | null;
  projen: boolean;
}

export interface BuildOrderResult {
  layer: number;
  packages: LayerPackage[];
}

// ---------- workspace scanning ----------

function safeReaddir(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

interface PackageJsonShape {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function readPkg(pkgPath: string): PackageJsonShape | null {
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as PackageJsonShape;
  } catch {
    return null;
  }
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  'dist',
  'build',
  'coverage',
  '.cache',
]);

export function findWorkspaceRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  while (true) {
    const entries = safeReaddir(dir);
    const siblingPkgs = entries.filter(
      (e) =>
        e.isDirectory() &&
        !SKIP_DIRS.has(e.name) &&
        !e.name.startsWith('.') &&
        fs.existsSync(path.join(dir, e.name, 'package.json')),
    );
    if (siblingPkgs.length >= 3) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function scanWorkspace(rootDir: string, { depth = 1 }: { depth?: number } = {}): Workspace {
  const packagesByFolder = new Map<string, PackageRecord>();
  const packagesByName = new Map<string, PackageRecord>();

  const scan = (dir: string, relPrefix: string, currentDepth: number) => {
    for (const entry of safeReaddir(dir)) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      const folder = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      const fullPath = path.join(dir, entry.name);
      const pkgPath = path.join(fullPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = readPkg(pkgPath);
        if (pkg && pkg.name) {
          const record: PackageRecord = {
            folder,
            name: pkg.name,
            version: pkg.version ?? null,
            path: fullPath,
            dependencies: pkg.dependencies ?? {},
            devDependencies: pkg.devDependencies ?? {},
            projen: fs.existsSync(path.join(fullPath, '.projenrc.ts')),
          };
          packagesByFolder.set(folder, record);
          packagesByName.set(pkg.name, record);
        }
      }
      if (currentDepth < depth) {
        scan(fullPath, folder, currentDepth + 1);
      }
    }
  };

  scan(rootDir, '', 1);
  return { root: rootDir, packagesByFolder, packagesByName };
}

export function resolvePackage(query: string, workspace: Workspace): PackageRecord | null {
  const clean = query.replace(/\/$/, '');
  if (workspace.packagesByFolder.has(clean)) return workspace.packagesByFolder.get(clean)!;
  if (workspace.packagesByName.has(clean)) return workspace.packagesByName.get(clean)!;
  const asPath = path.resolve(clean);
  if (fs.existsSync(path.join(asPath, 'package.json'))) {
    const relKey = path.relative(workspace.root, asPath).split(path.sep).join('/');
    if (workspace.packagesByFolder.has(relKey)) {
      return workspace.packagesByFolder.get(relKey)!;
    }
  }
  return null;
}

// ---------- tree building ----------

function buildTree(
  rootPkg: PackageRecord,
  workspace: Workspace,
  { includeDev = false }: { includeDev?: boolean } = {},
): TreeNode {
  const visit = (pkg: PackageRecord, stack: string[]): TreeNode => {
    const inCycle = stack.includes(pkg.name);
    const node: TreeNode = {
      name: pkg.name,
      folder: pkg.folder,
      version: pkg.version,
      owned: true,
      cycle: inCycle,
      children: [],
    };
    if (inCycle) return node;
    const deps = { ...pkg.dependencies, ...(includeDev ? pkg.devDependencies : {}) };
    const nextStack = [...stack, pkg.name];
    for (const [depName] of Object.entries(deps).sort(([a], [b]) => a.localeCompare(b))) {
      const owned = workspace.packagesByName.get(depName);
      if (owned) {
        node.children.push(visit(owned, nextStack));
      } else {
        node.children.push({
          name: depName,
          folder: '',
          version: null,
          owned: false,
          cycle: false,
          children: [],
        });
      }
    }
    return node;
  };
  return visit(rootPkg, []);
}

// ---------- DAG / build order ----------

function collectOwnedDag(root: TreeNode): Map<string, DagNode> {
  const nodes = new Map<string, DagNode>();
  const walk = (node: TreeNode, parentName: string | null) => {
    if (node.owned) {
      if (!nodes.has(node.name)) {
        nodes.set(node.name, {
          name: node.name,
          folder: node.folder,
          version: node.version,
          outgoing: new Set(),
        });
      }
      // Must add edge before the cycle-return guard so Kahn's algorithm can detect cycles
      if (parentName) {
        nodes.get(parentName)!.outgoing.add(node.name);
      }
    }
    // Edges are already recorded above — safe to bail on cycles now
    if (node.cycle) return;
    for (const child of node.children) {
      walk(child, node.owned ? node.name : parentName);
    }
  };
  walk(root, null);
  return nodes;
}

function computeBuildOrder(
  dag: Map<string, DagNode>,
  workspace: Workspace,
): { layers: BuildOrderResult[]; cycle: string[] | null } {
  const remaining = new Map<string, Set<string>>();
  for (const [name, n] of dag) remaining.set(name, new Set(n.outgoing));
  const layers: BuildOrderResult[] = [];
  let layerNum = 1;
  while (remaining.size) {
    const ready = [...remaining]
      .filter(([, outs]) => outs.size === 0)
      .map(([n]) => n)
      .sort();
    if (!ready.length) {
      return { layers, cycle: [...remaining.keys()] };
    }
    const packages: LayerPackage[] = ready.map((name) => {
      const n = dag.get(name)!;
      return {
        name,
        folder: n.folder,
        version: n.version,
        projen: workspace.packagesByName.get(name)?.projen ?? false,
      };
    });
    layers.push({ layer: layerNum++, packages });
    for (const name of ready) {
      remaining.delete(name);
      for (const outs of remaining.values()) outs.delete(name);
    }
  }
  return { layers, cycle: null };
}

// ---------- public API ----------

export function getBuildOrder(
  pkg: string,
  workspace: Workspace,
  { includeDev = false }: { includeDev?: boolean } = {},
): BuildOrderResult[] {
  const resolved = resolvePackage(pkg, workspace);
  if (!resolved) {
    throw new Error(`Package not found: ${pkg}`);
  }

  const tree = buildTree(resolved, workspace, { includeDev });
  const dag = collectOwnedDag(tree);
  const { layers, cycle } = computeBuildOrder(dag, workspace);

  if (cycle) {
    throw new Error(`Cycle detected among: ${cycle.join(', ')}`);
  }

  return layers;
}

export function getTree(
  pkg: string,
  workspace: Workspace,
  {
    includeDev = false,
    owned,
    external,
  }: { includeDev?: boolean; owned?: boolean; external?: boolean } = {},
): TreeNodeResult {
  const resolved = resolvePackage(pkg, workspace);
  if (!resolved) {
    throw new Error(`Package not found: ${pkg}`);
  }

  const tree = buildTree(resolved, workspace, { includeDev });
  if (owned || external) {
    return filterTree(tree, { owned, external });
  }
  return tree;
}

function filterTree(
  node: TreeNode,
  { owned, external }: { owned?: boolean; external?: boolean },
): TreeNodeResult {
  const keep = (child: TreeNode) => {
    if (owned && external) return true;
    return (owned ? child.owned : true) && (external ? !child.owned : true);
  };
  const recurse = (n: TreeNode): TreeNodeResult => ({
    ...n,
    children: n.children.filter(keep).map(recurse),
  });
  return recurse(node);
}

export function getDag(
  pkg: string,
  workspace: Workspace,
  { includeDev = false }: { includeDev?: boolean } = {},
): DagNodeResult[] {
  const resolved = resolvePackage(pkg, workspace);
  if (!resolved) {
    throw new Error(`Package not found: ${pkg}`);
  }

  const tree = buildTree(resolved, workspace, { includeDev });
  const dag = collectOwnedDag(tree);
  return [...dag.values()]
    .map((n) => ({
      name: n.name,
      folder: n.folder,
      version: n.version,
      dependsOn: [...n.outgoing].sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function runDoctor(workspace: Workspace): DoctorIssue[] {
  const issues: DoctorIssue[] = [];
  const allNames = new Set(workspace.packagesByName.keys());

  for (const pkg of workspace.packagesByFolder.values()) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [depName, depRange] of Object.entries(deps)) {
      if (!allNames.has(depName)) continue;
      const target = workspace.packagesByName.get(depName)!;
      if (isNonSemverRange(depRange)) continue;
      if (
        target.version &&
        target.version !== '0.0.0' &&
        !rangeSatisfied(depRange, target.version)
      ) {
        issues.push({
          kind: 'version-drift',
          from: pkg.folder,
          dep: depName,
          declared: depRange,
          onDisk: target.version,
        });
      }
    }
  }

  const cycle = detectCycle(workspace);
  if (cycle) issues.push({ kind: 'cycle', cycle });

  return issues;
}

const NON_SEMVER_PREFIXES = [
  'file:',
  'workspace:',
  'link:',
  'portal:',
  'npm:',
  'git+',
  'git:',
  'http:',
  'https:',
];

function isNonSemverRange(range: string): boolean {
  if (range === '*' || range === 'latest' || range === 'next') return true;
  return NON_SEMVER_PREFIXES.some((p) => range.startsWith(p));
}

function rangeSatisfied(range: string, version: string): boolean {
  return semver.satisfies(version, range, { includePrerelease: true });
}

function detectCycle(workspace: Workspace): string[] | null {
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  for (const n of workspace.packagesByName.keys()) color.set(n, WHITE);
  const stack: string[] = [];

  const dfs = (name: string): string[] | null => {
    color.set(name, GRAY);
    stack.push(name);
    const pkg = workspace.packagesByName.get(name);
    if (pkg) {
      for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
        if (!workspace.packagesByName.has(dep)) continue;
        if (color.get(dep) === GRAY) {
          const i = stack.indexOf(dep);
          return stack.slice(i).concat(dep);
        }
        if (color.get(dep) === WHITE) {
          const found = dfs(dep);
          if (found) return found;
        }
      }
    }
    color.set(name, BLACK);
    stack.pop();
    return null;
  };

  for (const name of workspace.packagesByName.keys()) {
    if (color.get(name) === WHITE) {
      const found = dfs(name);
      if (found) return found;
    }
  }
  return null;
}

export function listPackages(workspace: Workspace): PackageRecord[] {
  return [...workspace.packagesByFolder.values()].sort((a, b) => a.folder.localeCompare(b.folder));
}
