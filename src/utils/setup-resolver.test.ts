/**
 * Tests for Setup Documentation Resolver
 */

import { describe, expect, it } from 'bun:test';
import fs from 'fs';
import { getAllAvailableSetupDocs, getSetupContent, resolveSetupPath } from './setup-resolver';

// Use real fs to bypass test mocks
const fsToUse = (fs as any).realFs || fs;

// Helper to normalize paths for cross-platform testing
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

describe('Setup Resolver', () => {
  describe('resolveSetupPath', () => {
    it('should resolve GitHub native tool setup path', () => {
      const result = resolveSetupPath('github', 'native');

      expect(result).not.toBeNull();
      expect(result?.source).toBe('native');
      expect(normalizePath(result!.path)).toContain('src/tools/github/SETUP.md');
      expect(fsToUse.existsSync(result!.path)).toBe(true);
    });

    it('should resolve a remote MCP setup path', () => {
      // Was 'github'. Its SETUP_github.md went with the 17 gateway-routed servers;
      // aws-knowledge-mcp-server is one of the two remote servers still shipped.
      const result = resolveSetupPath('aws-knowledge-mcp-server', 'remote');

      expect(result).not.toBeNull();
      expect(result?.source).toBe('remote');
      expect(normalizePath(result!.path)).toContain(
        'src/remote-mcps/SETUP_aws-knowledge-mcp-server.md',
      );
      expect(fsToUse.existsSync(result!.path)).toBe(true);
    });

    it('should resolve native and remote setups from their own directories', () => {
      // No tool id currently has both a native and a remote SETUP doc, so this can no
      // longer compare two paths for one id. What it still pins is the part that
      // mattered: `source` decides which directory is searched.
      const nativeResult = resolveSetupPath('github', 'native');
      const remoteResult = resolveSetupPath('aws-knowledge-mcp-server', 'remote');

      expect(nativeResult).not.toBeNull();
      expect(remoteResult).not.toBeNull();
      expect(nativeResult?.path).not.toBe(remoteResult?.path);
      expect(nativeResult?.source).toBe('native');
      expect(remoteResult?.source).toBe('remote');
      expect(normalizePath(nativeResult!.path)).toContain('src/tools/');
      expect(normalizePath(remoteResult!.path)).toContain('src/remote-mcps/');
    });

    it('should return null for non-existent tool', () => {
      const result = resolveSetupPath('non-existent-tool-xyz123', 'native');

      expect(result).toBeNull();
    });

    it('should handle tool ID with different casing', () => {
      const result = resolveSetupPath('GitHub', 'native'); // Uppercase

      // Should normalize to lowercase and find the file
      expect(result).not.toBeNull();
      expect(result?.source).toBe('native');
    });

    it('should normalize tool ID with underscores', () => {
      const _result = resolveSetupPath('new_relic', 'native'); // with underscore

      // Should normalize to hyphenated and find newrelic
      // Note: This will work once we add hyphen normalization
      // For now, exact match is required
    });
  });

  describe('getSetupContent', () => {
    it('should get GitHub setup content', () => {
      const result = getSetupContent('github', 'native');

      expect(result.exists).toBe(true);
      expect(result.content).toContain('# GitHub');
      expect(result.content).toContain('GITHUB_TOKEN');
      expect(result.filePath).toBeDefined();
      expect(result.source).toBe('native');
    });

    it('should get remote setup content for a remote server', () => {
      const result = getSetupContent('aws-knowledge-mcp-server', 'remote');

      expect(result.exists).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.filePath).toBeDefined();
      expect(result.source).toBe('remote');
    });

    it('should resolve native and remote docs from their own sources', () => {
      // No id ships docs in both places any more: the servers that had a remote
      // counterpart to a native tool were removed. So the two lookups are checked
      // against the ids that actually have a doc, and each must report its own
      // source rather than falling back to the other directory.
      const native = getSetupContent('github', 'native');
      const remote = getSetupContent('figma-dev', 'remote');

      expect(native.exists).toBe(true);
      expect(native.source).toBe('native');
      expect(remote.exists).toBe(true);
      expect(remote.source).toBe('remote');
      expect(native.content).not.toBe(remote.content);
    });

    it('should not invent a remote doc for a native-only tool', () => {
      const result = getSetupContent('github', 'remote');

      expect(result.exists).toBe(false);
      expect(result.content).toBe('');
    });

    it('should return not found for non-existent tool', () => {
      const result = getSetupContent('non-existent-tool-xyz123', 'native');

      expect(result.exists).toBe(false);
      expect(result.content).toBe('');
      expect(result.filePath).toBeUndefined();
      expect(result.source).toBeUndefined();
    });

    it('should handle markdown formatting in content', () => {
      const result = getSetupContent('github', 'native');

      // Check for markdown elements
      expect(result.content).toContain('##'); // Headers
      expect(result.content).toContain('|'); // Tables
      expect(result.content).toContain('- '); // Lists
    });
  });

  describe('getAllAvailableSetupDocs', () => {
    it('should find all available setup docs', () => {
      const available = getAllAvailableSetupDocs();

      // Should find at least the ones we created
      expect(available.length).toBeGreaterThan(0);

      // Check for specific tools we know exist
      const toolIds = available.map((item) => item.toolId);
      expect(toolIds).toContain('github');
      expect(toolIds).toContain('aws-knowledge-mcp-server');
    });

    it('should categorize tools by source', () => {
      const available = getAllAvailableSetupDocs();

      // Find specific tools and check their sources
      const github = available.find((item) => item.toolId === 'github');
      expect(github?.source).toBe('native');
    });

    it('should return unique tool IDs', () => {
      const available = getAllAvailableSetupDocs();
      const toolIds = available.map((item) => item.toolId);
      const _uniqueIds = new Set(toolIds);

      // Tool IDs may have duplicates (e.g., "github" in both native and remote)
      // but each entry should have a unique combination of toolId + source
      const uniqueCombos = new Set(available.map((item) => `${item.toolId}:${item.source}`));
      expect(available.length).toBe(uniqueCombos.size);
    });
  });

  describe('Error Handling', () => {
    it('should handle file read errors gracefully', () => {
      // Try to get content for a path that exists but might have read issues
      // This test would need to mock fs to simulate read errors
      // For now, we'll just ensure the function doesn't throw

      expect(() => {
        getSetupContent('some-tool', 'native');
      }).not.toThrow();
    });
  });
});
