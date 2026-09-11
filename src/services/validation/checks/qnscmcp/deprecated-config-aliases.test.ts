import { describe, expect, it, spyOn } from 'bun:test';
import '../../../../test-utils/mocks';
import { deprecatedConfigAliasCheck, findDeprecatedAliases } from './deprecated-config-aliases';
import type { QnscMcpConfigContext } from '../../types';

// Access the mocked fs module
import fs from 'fs';

describe('deprecatedConfigAliasCheck', () => {
  const makeContext = (filePath?: string): QnscMcpConfigContext => ({
    type: 'qnsc-mcp-config',
    config: {},
    filePath,
  });

  it('should have correct metadata', () => {
    expect(deprecatedConfigAliasCheck.id).toBe('qnscmcp.deprecated-config-aliases');
    expect(deprecatedConfigAliasCheck.name).toBe('Deprecated Configuration Aliases');
    expect(deprecatedConfigAliasCheck.appliesTo).toBe('qnsc-mcp-config');
  });

  it('should return no issues when no config file path is provided', () => {
    const issues = deprecatedConfigAliasCheck.run(makeContext());
    expect(issues).toEqual([]);
  });

  it('should return no issues when config has no deprecated keys', () => {
    spyOn(fs, 'readFileSync').mockReturnValue('tools:\n  includeRemoteMCPs:\n    - slack\n');

    const issues = deprecatedConfigAliasCheck.run(makeContext('/some/path/.qnscmcp.yaml'));
    expect(issues).toEqual([]);
  });

  // The shipped alias map is empty, so run() reports nothing; the detection
  // logic is exercised directly with synthetic aliases instead of naming
  // integrations that were removed from this build.
  const ALIASES: Record<string, string> = {
    'tools.includeMCPs.[].legacy-one': 'tools.includeRemoteMCPs.[].current',
    'tools.includeCategories.[].Legacy': 'tools.includeRemoteMCPs.[].current',
    'tools.include.[].legacy-one-*': 'tools.includeRemoteMCPs.[].current',
    'tools.legacyFlag': 'tools.currentFlag',
  };

  it('should report nothing for a config using keys that are no longer aliased', () => {
    spyOn(fs, 'readFileSync').mockReturnValue('tools:\n  includeMCPs:\n    - legacy-one\n');

    expect(deprecatedConfigAliasCheck.run(makeContext('/some/path/.qnscmcp.yaml'))).toEqual([]);
  });

  it('should detect a deprecated includeCategories alias', () => {
    const issues = findDeprecatedAliases(
      { tools: { includeCategories: ['Legacy'] } },
      ALIASES,
    );

    const issue = issues.find((i) => i.message.includes('Legacy'));
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('info');
    expect(issue!.code).toBe('DEPRECATED_CONFIG_ALIAS');
    expect(issue!.details).toContain('includeRemoteMCPs');
    expect(issue!.details).toContain('current');
  });

  it('should detect a deprecated includeMCPs alias', () => {
    const issues = findDeprecatedAliases({ tools: { includeMCPs: ['legacy-one'] } }, ALIASES);

    const issue = issues.find((i) => i.message.includes('legacy-one'));
    expect(issue).toBeDefined();
    expect(issue!.details).toContain('current');
  });

  it('should detect a wildcard alias from an individual tool id', () => {
    const issues = findDeprecatedAliases(
      { tools: { include: ['legacy-one-do-thing'] } },
      ALIASES,
    );

    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].details).toContain('current');
  });

  it('should detect a non-array alias by property presence', () => {
    const issues = findDeprecatedAliases({ tools: { legacyFlag: true } }, ALIASES);

    const issue = issues.find((i) => i.message.includes('tools.legacyFlag'));
    expect(issue).toBeDefined();
    expect(issue!.details).toContain('tools.currentFlag');
  });

  it('should detect multiple deprecated aliases at once', () => {
    const issues = findDeprecatedAliases(
      { tools: { includeCategories: ['Legacy'], includeMCPs: ['legacy-one'], legacyFlag: true } },
      ALIASES,
    );

    expect(issues.length).toBeGreaterThanOrEqual(3);
  });

  it('should report nothing for a non-object config', () => {
    expect(findDeprecatedAliases(null, ALIASES)).toEqual([]);
    expect(findDeprecatedAliases('a string', ALIASES)).toEqual([]);
  });

  it('should skip an alias whose source is not an array', () => {
    expect(findDeprecatedAliases({ tools: { includeMCPs: 'legacy-one' } }, ALIASES)).toEqual([]);
  });

  it('should return no issues when readFileSync throws', () => {
    spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('file not found');
    });

    const issues = deprecatedConfigAliasCheck.run(makeContext('/nonexistent/.qnscmcp.yaml'));
    expect(issues).toEqual([]);
  });

  it('should return no issues for invalid YAML', () => {
    spyOn(fs, 'readFileSync').mockReturnValue('not: [valid: yaml: content');

    const issues = deprecatedConfigAliasCheck.run(makeContext('/some/path/.qnscmcp.yaml'));
    expect(issues).toEqual([]);
  });

});
