import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { registry } from '../../../../registry/tool-registry';
import type { QnscMcpConfigContext } from '../../types';
import { toolReferenceValidation } from './tool-references';

describe('toolReferenceValidation', () => {
  const createContext = (tools: Record<string, any> = {}): QnscMcpConfigContext => ({
    type: 'qnsc-mcp-config',
    config: { tools },
    filePath: '/test/.qnscmcp.yaml',
  });

  let getAllToolsSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    mock.restore();
    getAllToolsSpy = spyOn(registry, 'getAllTools');
  });

  afterEach(() => {
    mock.restore();
  });

  describe('when registry is available', () => {
    beforeEach(() => {
      // Mock registry with some tools
      getAllToolsSpy.mockReturnValue([
        { id: 'tool1', name: 'Tool 1', description: '', category: 'test' },
        { id: 'tool2', name: 'Tool 2', description: '', category: 'test' },
        { id: 'other-tool', name: 'Other Tool', description: '', category: 'other' },
      ]);
    });

    it('should return no issues for valid include list', () => {
      const context = createContext({
        include: ['tool1', 'tool2'],
      });

      const issues = toolReferenceValidation.run(context);

      expect(issues).toHaveLength(0);
    });

    it('should return no issues for valid exclude list', () => {
      const context = createContext({
        exclude: ['tool1', 'other-tool'],
      });

      const issues = toolReferenceValidation.run(context);

      expect(issues).toHaveLength(0);
    });

    it('should warn about invalid tool in include list', () => {
      const context = createContext({
        include: ['tool1', 'invalid-tool'],
      });

      const issues = toolReferenceValidation.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('INVALID_TOOL_REFERENCE');
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].message).toContain('invalid-tool');
      expect(issues[0].message).toContain('include list');
    });

    it('should warn about invalid tool in exclude list', () => {
      const context = createContext({
        exclude: ['nonexistent-tool'],
      });

      const issues = toolReferenceValidation.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('INVALID_TOOL_REFERENCE');
      expect(issues[0].message).toContain('nonexistent-tool');
      expect(issues[0].message).toContain('exclude list');
    });

    it('should check both include and exclude lists', () => {
      const context = createContext({
        include: ['invalid1'],
        exclude: ['invalid2'],
      });

      const issues = toolReferenceValidation.run(context);

      expect(issues).toHaveLength(2);
      expect(issues.some((i) => i.message.includes('invalid1'))).toBe(true);
      expect(issues.some((i) => i.message.includes('invalid2'))).toBe(true);
    });

    it('should handle empty include/exclude lists', () => {
      const context = createContext({
        include: [],
        exclude: [],
      });

      const issues = toolReferenceValidation.run(context);

      expect(issues).toHaveLength(0);
    });

    it('should handle missing include/exclude lists', () => {
      const context = createContext({});

      const issues = toolReferenceValidation.run(context);

      expect(issues).toHaveLength(0);
    });

    it('should include helpful details in issue', () => {
      const context = createContext({
        include: ['typo-tool'],
      });

      const issues = toolReferenceValidation.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].details).toContain('qnsc-mcp list-tools');
    });
  });

  describe('when registry is not initialized', () => {
    it('should return info issue when getAllTools returns empty and there are tool references', () => {
      getAllToolsSpy.mockReturnValue([]);

      const context = createContext({
        include: ['any-tool'],
      });

      const issues = toolReferenceValidation.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('info');
      expect(issues[0].code).toBe('VALIDATION_SKIPPED');
      expect(issues[0].message).toContain('skipped');
    });

    it('should not return info issue when getAllTools returns empty but no tool references', () => {
      getAllToolsSpy.mockReturnValue([]);

      const context = createContext({});

      const issues = toolReferenceValidation.run(context);

      expect(issues).toHaveLength(0); // No references to validate
    });

    it('should return info issue when registry throws and there are tool references', () => {
      getAllToolsSpy.mockImplementation(() => {
        throw new Error('Registry not initialized');
      });

      const context = createContext({
        include: ['any-tool'],
      });

      const issues = toolReferenceValidation.run(context);

      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('info');
      expect(issues[0].code).toBe('VALIDATION_SKIPPED');
    });

    it('should not return info issue when registry throws but no tool references', () => {
      getAllToolsSpy.mockImplementation(() => {
        throw new Error('Registry not initialized');
      });

      const context = createContext({});

      const issues = toolReferenceValidation.run(context);

      expect(issues).toHaveLength(0); // No references to validate
    });
  });
});
