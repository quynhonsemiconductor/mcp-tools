import { describe, expect, it } from 'bun:test';
import { TestMcpTools } from './test-mcp-tools-prompt';

describe('TestMcpTools Prompt', () => {
  it('should generate a prompt with required tool_name and feature_description', async () => {
    const prompt = new TestMcpTools();
    const result = await prompt.load({
      tool_name: 'getRemoteItem',
      feature_description: 'includeMilestones parameter for epics and features',
    });

    expect(result).toContain('getRemoteItem');
    expect(result).toContain('includeMilestones parameter for epics and features');
    expect(result).toContain('PHASE 1: DISCOVERY');
    expect(result).toContain('PHASE 2: BASELINE TESTING');
    expect(result).toContain('PHASE 3: FEATURE TESTING');
    expect(result).toContain('MCP tool calls');
  });

  it('should include test data IDs when provided', async () => {
    const prompt = new TestMcpTools();
    const result = await prompt.load({
      tool_name: 'getRemoteItem',
      feature_description: 'includeMilestones parameter',
      test_data_ids: 'E45109,F208282,US501397',
    });

    expect(result).toContain('E45109,F208282,US501397');
  });

  it('should handle missing test_data_ids gracefully', async () => {
    const prompt = new TestMcpTools();
    const result = await prompt.load({
      tool_name: 'getRemoteItem',
      feature_description: 'includeMilestones parameter',
    });

    expect(result).toContain('Discover appropriate test data');
  });

  it('should include testing methodology phases', async () => {
    const prompt = new TestMcpTools();
    const result = await prompt.load({
      tool_name: 'listEpics',
      feature_description: 'new filtering parameter',
    });

    expect(result).toContain('PHASE 1: DISCOVERY');
    expect(result).toContain('PHASE 2: BASELINE TESTING');
    expect(result).toContain('PHASE 3: FEATURE TESTING');
    expect(result).toContain('PHASE 4: EDGE CASE TESTING');
    expect(result).toContain('PHASE 5: VALIDATION');
  });

  it('should include test scenarios', async () => {
    const prompt = new TestMcpTools();
    const result = await prompt.load({
      tool_name: 'getRemoteItem',
      feature_description: 'test feature',
    });

    expect(result).toContain('SCENARIO 1: POSITIVE CASE');
    expect(result).toContain('SCENARIO 2: EMPTY DATA CASE');
    expect(result).toContain('SCENARIO 3: UNSUPPORTED TYPE CASE');
    expect(result).toContain('SCENARIO 4: MULTIPLE DATA CASE');
    expect(result).toContain('SCENARIO 5: BACKWARD COMPATIBILITY');
    expect(result).toContain('SCENARIO 6: COMBINED PARAMETERS');
    expect(result).toContain('SCENARIO 7: DATA ACCURACY');
  });

  it('should include MCP call guidelines', async () => {
    const prompt = new TestMcpTools();
    const result = await prompt.load({
      tool_name: 'getRemoteItem',
      feature_description: 'test feature',
    });

    expect(result).toContain('Make ACTUAL tool calls');
    expect(result).toContain('Use REAL data IDs');
    expect(result).toContain('DO NOT');
    expect(result).toContain('Write code or scripts');
  });

  it('should include documentation format', async () => {
    const prompt = new TestMcpTools();
    const result = await prompt.load({
      tool_name: 'getRemoteItem',
      feature_description: 'test feature',
    });

    expect(result).toContain('documentation_format');
    expect(result).toContain('Tool Call:');
    expect(result).toContain('Response:');
    expect(result).toContain('Observations:');
    expect(result).toContain('Pass/Fail:');
  });

  it('should include validation checklist', async () => {
    const prompt = new TestMcpTools();
    const result = await prompt.load({
      tool_name: 'getRemoteItem',
      feature_description: 'test feature',
    });

    expect(result).toContain('validation_checklist');
    expect(result).toContain('FUNCTIONALITY:');
    expect(result).toContain('EDGE CASES:');
    expect(result).toContain('INTEGRATION:');
    expect(result).toContain('COMPATIBILITY:');
    expect(result).toContain('QUALITY:');
  });

  it('should include test report format', async () => {
    const prompt = new TestMcpTools();
    const result = await prompt.load({
      tool_name: 'getRemoteItem',
      feature_description: 'includeMilestones parameter',
    });

    expect(result).toContain('Test Report: getRemoteItem');
    expect(result).toContain('includeMilestones parameter');
    expect(result).toContain('Executive Summary');
    expect(result).toContain('Test Environment');
    expect(result).toContain('Findings');
    expect(result).toContain('Recommendations');
  });

  it('should include best practices', async () => {
    const prompt = new TestMcpTools();
    const result = await prompt.load({
      tool_name: 'getRemoteItem',
      feature_description: 'test feature',
    });

    expect(result).toContain('best_practices');
    expect(result).toContain('SYSTEMATIC APPROACH');
    expect(result).toContain('REAL DATA USAGE');
    expect(result).toContain('COMPREHENSIVE COVERAGE');
    expect(result).toContain('CLEAR DOCUMENTATION');
  });

  it('should include common issues to watch for', async () => {
    const prompt = new TestMcpTools();
    const result = await prompt.load({
      tool_name: 'getRemoteItem',
      feature_description: 'test feature',
    });

    expect(result).toContain('common_issues');
    expect(result).toContain('DATA ISSUES');
    expect(result).toContain('PARAMETER ISSUES');
    expect(result).toContain('RESPONSE ISSUES');
    expect(result).toContain('COMPATIBILITY ISSUES');
  });

  it('should emphasize making actual MCP calls', async () => {
    const prompt = new TestMcpTools();
    const result = await prompt.load({
      tool_name: 'getRemoteItem',
      feature_description: 'test feature',
    });

    expect(result).toContain('Make ACTUAL tool calls');
    expect(result).toContain('do not write code or scripts');
    expect(result).toContain('Use the MCP tools available to you directly');
  });
});
