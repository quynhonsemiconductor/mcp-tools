import path from 'node:path';
import fs from 'node:fs';
import { findWorkspaceRoot, scanWorkspace, type Workspace } from './workspace-graph';

function safeRealpath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

export function resolveWorkspaceRoot(workspaceDir: string | undefined): string {
  const wsRoot = workspaceDir ? path.resolve(workspaceDir) : findWorkspaceRoot(process.cwd());
  if (!wsRoot) {
    throw new Error('Could not detect workspace root. Provide the workspace parameter.');
  }

  if (workspaceDir) {
    const realRoot = safeRealpath(wsRoot);
    const cwd = safeRealpath(process.cwd());
    const allowed = [
      cwd,
      ...(process.env.QNSC_MCP_ALLOWED_FILE_PATHS ?? '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .map(safeRealpath),
    ];
    if (!allowed.some((d) => realRoot === d || realRoot.startsWith(d + path.sep))) {
      throw new Error(
        'Workspace path is outside the allowed directory. ' +
          'Set QNSC_MCP_ALLOWED_FILE_PATHS to permit additional paths.',
      );
    }
  }

  return wsRoot;
}

export function resolveAndScan(workspaceDir: string | undefined, depth: number): Workspace {
  const wsRoot = resolveWorkspaceRoot(workspaceDir);
  const workspace = scanWorkspace(wsRoot, { depth });
  if (workspace.packagesByFolder.size === 0) {
    throw new Error(
      'No packages found in the specified workspace. Verify the path is a valid workspace root.',
    );
  }
  return workspace;
}
