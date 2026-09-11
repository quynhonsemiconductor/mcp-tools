/**
 * tool-id-utils.test.ts - Unit tests for tool ID utilities
 */

import { describe, expect, test } from 'bun:test';
import {
  createToolDisplayName,
  createToolId,
  createValidId,
  getMCPNameFromToolId,
  getToolDelimiter,
  getToolNameFromToolId,
  getToolPrefix,
  isToolFromProvider,
  parseToolId,
  TOOL_DELIMITERS,
  TOOL_PREFIXES,
} from './tool-id-utils';

describe('tool-id-utils', () => {
  describe('createValidId', () => {
    test('converts string to lowercase', () => {
      expect(createValidId('MyToolName')).toBe('mytoolname');
    });

    test('replaces spaces with hyphens', () => {
      expect(createValidId('My Tool Name')).toBe('my-tool-name');
    });

    test('replaces special characters with hyphens', () => {
      expect(createValidId('tool@123!')).toBe('tool-123');
      expect(createValidId('my_tool#name')).toBe('my-tool-name');
    });

    test('collapses multiple hyphens', () => {
      expect(createValidId('my---tool')).toBe('my-tool');
      expect(createValidId('tool___name')).toBe('tool-name');
    });

    test('removes leading and trailing hyphens', () => {
      expect(createValidId('-mytool-')).toBe('mytool');
      expect(createValidId('___tool___')).toBe('tool');
    });

    test('handles empty string', () => {
      expect(createValidId('')).toBe('unknown');
    });

    test('preserves valid alphanumeric with hyphens', () => {
      expect(createValidId('my-tool-123')).toBe('my-tool-123');
    });
  });

  describe('getToolDelimiter', () => {
    test('returns correct delimiter for bundled', () => {
      expect(getToolDelimiter('bundled')).toBe('__');
    });

    test('returns correct delimiter for remote', () => {
      expect(getToolDelimiter('remote')).toBe('__');
    });

    test('returns correct delimiter for local', () => {
      expect(getToolDelimiter('local')).toBe('__');
    });

    test('returns empty string for native', () => {
      expect(getToolDelimiter('native')).toBe('');
    });
  });

  describe('getToolPrefix', () => {
    test('returns empty string for bundled', () => {
      expect(getToolPrefix('bundled')).toBe('');
    });

    test('returns remote- for remote', () => {
      expect(getToolPrefix('remote')).toBe('remote-');
    });

    test('returns local- for local', () => {
      expect(getToolPrefix('local')).toBe('local-');
    });

    test('returns empty string for native', () => {
      expect(getToolPrefix('native')).toBe('');
    });
  });

  describe('createToolId', () => {
    test('creates native tool ID', () => {
      expect(createToolId('native', '', 'webFetch')).toBe('webfetch');
      expect(createToolId('native', 'ignored', 'myTool')).toBe('mytool');
    });

    test('creates bundled tool ID', () => {
      expect(createToolId('bundled', 'playwright', 'browser_click')).toBe(
        'playwright__browser-click',
      );
      expect(createToolId('bundled', 'My MCP', 'My Tool')).toBe('my-mcp__my-tool');
    });

    test('creates remote tool ID', () => {
      expect(createToolId('remote', 'github', 'createIssue')).toBe('remote-github__createissue');
      expect(createToolId('remote', 'My Server', 'My Tool')).toBe('remote-my-server__my-tool');
    });

    test('creates local tool ID', () => {
      expect(createToolId('local', 'filesystem', 'readFile')).toBe('local-filesystem__readfile');
      expect(createToolId('local', 'My Server', 'My Tool')).toBe('local-my-server__my-tool');
    });

    test('handles special characters in names', () => {
      expect(createToolId('bundled', 'playwright@123', 'tool#1')).toBe('playwright-123__tool-1');
    });

    test('handles empty tool name', () => {
      expect(createToolId('bundled', 'mcp', '')).toBe('mcp__unknown');
    });
  });

  describe('createToolDisplayName', () => {
    test('creates native tool display name', () => {
      expect(createToolDisplayName('native', '', 'webFetch')).toBe('webFetch');
      expect(createToolDisplayName('native', 'ignored', 'MyTool')).toBe('MyTool');
    });

    test('creates bundled tool display name', () => {
      expect(createToolDisplayName('bundled', 'Playwright', 'browser_click')).toBe(
        'Playwright__browser_click',
      );
    });

    test('creates remote tool display name', () => {
      expect(createToolDisplayName('remote', 'GitHub', 'createIssue')).toBe('GitHub__createIssue');
    });

    test('creates local tool display name', () => {
      expect(createToolDisplayName('local', 'FileSystem', 'readFile')).toBe('FileSystem__readFile');
    });

    test('preserves original casing', () => {
      expect(createToolDisplayName('bundled', 'MyMCP', 'MyTool')).toBe('MyMCP__MyTool');
    });
  });

  describe('parseToolId', () => {
    test('parses native tool ID', () => {
      const result = parseToolId('webfetch');
      expect(result).toEqual({
        provider: 'native',
        mcpName: null,
        toolName: 'webfetch',
        isValid: true,
      });
    });

    test('parses bundled tool ID', () => {
      const result = parseToolId('playwright__browser-click');
      expect(result).toEqual({
        provider: 'bundled',
        mcpName: 'playwright',
        toolName: 'browser-click',
        isValid: true,
      });
    });

    test('parses remote tool ID', () => {
      const result = parseToolId('remote-github__createissue');
      expect(result).toEqual({
        provider: 'remote',
        mcpName: 'github',
        toolName: 'createissue',
        isValid: true,
      });
    });

    test('parses local tool ID', () => {
      const result = parseToolId('local-filesystem__readfile');
      expect(result).toEqual({
        provider: 'local',
        mcpName: 'filesystem',
        toolName: 'readfile',
        isValid: true,
      });
    });

    test('handles empty string', () => {
      const result = parseToolId('');
      expect(result.isValid).toBe(false);
      expect(result.provider).toBeNull();
    });

    test('handles malformed IDs', () => {
      // Remote prefix but wrong format
      const result1 = parseToolId('remote-nod delimiter');
      expect(result1.provider).toBe('native');

      // Multiple delimiters
      const result2 = parseToolId('mcp__tool__extra');
      expect(result2.provider).toBe('native');
    });

    test('roundtrip: create and parse', () => {
      const toolId = createToolId('remote', 'github', 'createIssue');
      const parsed = parseToolId(toolId);
      expect(parsed.provider).toBe('remote');
      expect(parsed.mcpName).toBe('github');
      expect(parsed.toolName).toBe('createissue');
    });
  });

  describe('isToolFromProvider', () => {
    test('correctly identifies native tools', () => {
      expect(isToolFromProvider('webfetch', 'native')).toBe(true);
      expect(isToolFromProvider('mytool', 'native')).toBe(true);
      expect(isToolFromProvider('remote-github__tool', 'native')).toBe(false);
    });

    test('correctly identifies bundled tools', () => {
      expect(isToolFromProvider('playwright__browser-click', 'bundled')).toBe(true);
      expect(isToolFromProvider('mcp__tool', 'bundled')).toBe(true);
      expect(isToolFromProvider('remote-github__tool', 'bundled')).toBe(false);
    });

    test('correctly identifies remote tools', () => {
      expect(isToolFromProvider('remote-github__createissue', 'remote')).toBe(true);
      expect(isToolFromProvider('remote-api__tool', 'remote')).toBe(true);
      expect(isToolFromProvider('playwright__browser-click', 'remote')).toBe(false);
    });

    test('correctly identifies local tools', () => {
      expect(isToolFromProvider('local-filesystem__readfile', 'local')).toBe(true);
      expect(isToolFromProvider('local-api__tool', 'local')).toBe(true);
      expect(isToolFromProvider('playwright__browser-click', 'local')).toBe(false);
    });
  });

  describe('getMCPNameFromToolId', () => {
    test('extracts MCP name from bundled tool', () => {
      expect(getMCPNameFromToolId('playwright__browser-click')).toBe('playwright');
    });

    test('extracts MCP name from remote tool', () => {
      expect(getMCPNameFromToolId('remote-github__createissue')).toBe('github');
    });

    test('extracts MCP name from local tool', () => {
      expect(getMCPNameFromToolId('local-filesystem__readfile')).toBe('filesystem');
    });

    test('returns null for native tool', () => {
      expect(getMCPNameFromToolId('webfetch')).toBeNull();
    });

    test('returns null for invalid ID', () => {
      expect(getMCPNameFromToolId('')).toBeNull();
    });
  });

  describe('getToolNameFromToolId', () => {
    test('extracts tool name from bundled tool', () => {
      expect(getToolNameFromToolId('playwright__browser-click')).toBe('browser-click');
    });

    test('extracts tool name from remote tool', () => {
      expect(getToolNameFromToolId('remote-github__createissue')).toBe('createissue');
    });

    test('extracts tool name from local tool', () => {
      expect(getToolNameFromToolId('local-filesystem__readfile')).toBe('readfile');
    });

    test('extracts tool name from native tool', () => {
      expect(getToolNameFromToolId('webfetch')).toBe('webfetch');
    });

    test('returns null for invalid ID', () => {
      expect(getToolNameFromToolId('')).toBeNull();
    });
  });

  describe('TOOL_DELIMITERS constant', () => {
    test('has correct values', () => {
      expect(TOOL_DELIMITERS.bundled).toBe('__');
      expect(TOOL_DELIMITERS.remote).toBe('__');
      expect(TOOL_DELIMITERS.local).toBe('__');
      expect(TOOL_DELIMITERS.native).toBe('');
    });
  });

  describe('TOOL_PREFIXES constant', () => {
    test('has correct values', () => {
      expect(TOOL_PREFIXES.bundled).toBe('');
      expect(TOOL_PREFIXES.remote).toBe('remote-');
      expect(TOOL_PREFIXES.local).toBe('local-');
      expect(TOOL_PREFIXES.native).toBe('');
    });
  });
});
