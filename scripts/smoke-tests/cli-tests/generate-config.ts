/**
 * Generates test config dynamically by scanning the codebase
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

/** Recursively find all .ts files */
function findTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      files.push(...findTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.includes('.test.')) {
      files.push(fullPath);
    }
  }
  return files;
}

/** Extract all categories from src/tools */
function getCategories(): string[] {
  const toolsDir = path.join(ROOT, 'src/tools');
  if (!existsSync(toolsDir)) return ['Utility', 'Web'];

  const categories = new Set<string>();
  for (const file of findTsFiles(toolsDir)) {
    const content = readFileSync(file, 'utf-8');
    const matches = content.matchAll(/category:\s*['"]([^'"]+)['"]/g);
    for (const match of matches) categories.add(match[1]);
  }
  return [...categories].sort();
}

/** Get bundled MCP names from bundled/ directory */
function getBundledMCPs(): string[] {
  const bundledDir = path.join(ROOT, 'bundled');
  if (!existsSync(bundledDir)) return [];

  return readdirSync(bundledDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(path.join(bundledDir, d.name, 'server.yaml')))
    .map(d => d.name)
    .sort();
}

/** Config generation result */
export interface TestConfigResult {
  path: string;
  categories: string[];
  mcps: string[];
}

/** Generate and write test config, return path and details */
export function ensureTestConfig(): TestConfigResult {
  const configDir = path.join(ROOT, '.smoke-test-binaries');
  const configPath = path.join(configDir, 'test-config.yaml');

  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });

  const categories = getCategories();
  const mcps = getBundledMCPs();

  const yaml = `# Auto-generated smoke test config
tools:
  include:
${categories.map(c => `    - "${c}"`).join('\n')}
  includeMCPs:
${mcps.map(m => `    - "${m}"`).join('\n')}
logging:
  enabled: false
`;

  writeFileSync(configPath, yaml);
  return { path: configPath, categories, mcps };
}
