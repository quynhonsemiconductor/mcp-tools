import { describe, expect, it } from 'bun:test';
import {
  getSchemaDescription,
  isSchemaOptional,
} from '@modelcontextprotocol/sdk/server/zod-compat.js';

import { setupStandardMocks } from '../../test-utils/mocks';
const { mockPath } = setupStandardMocks();

import {
  findMarkdownFiles,
  frontmatterToPromptConfig,
  generatePromptId,
  matchesIncludePatterns,
  parseFrontmatter,
  parseMarkdownContent,
  parseMarkdownPrompt,
} from './markdown-prompt-parser';

describe.skip('markdown-prompt-parser', () => {
  const templatePath = mockPath.realPath.resolve(
    __dirname,
    '../../../templates/prompt-template.md',
  );

  describe('parseFrontmatter', () => {
    it('should parse valid YAML frontmatter', () => {
      const content = `---
title: Test Prompt
description: A test prompt
category: Analysis
arguments:
  - name: input
    description: Input text
    required: true
---
# Test Content

This is the body.`;

      const result = parseFrontmatter(content);

      expect(result.frontmatter).toEqual({
        title: 'Test Prompt',
        description: 'A test prompt',
        category: 'Analysis',
        arguments: [
          {
            name: 'input',
            description: 'Input text',
            required: true,
          },
        ],
      });
      expect(result.body).toBe('# Test Content\n\nThis is the body.');
    });

    it('should handle content without frontmatter', () => {
      const content = 'Just markdown content.';
      const result = parseFrontmatter(content);

      expect(result.frontmatter).toBe(null);
      expect(result.body).toBe(content);
    });

    it('should handle malformed YAML', () => {
      const content = `---
invalid: [unclosed array
---
Content`;

      const result = parseFrontmatter(content);
      expect(result.frontmatter).toBe(null);
      expect(result.body).toBe(content);
    });

    it('should handle empty frontmatter', () => {
      const content = `---
---
Just content.`;

      const result = parseFrontmatter(content);
      expect(result.frontmatter).toBe(null);
    });
  });

  describe('generatePromptId', () => {
    it('should generate ID from filename', () => {
      expect(generatePromptId('test-prompt.md')).toBe('test-prompt');
      expect(generatePromptId('/path/to/My Test File.md')).toBe('my-test-file');
      expect(generatePromptId('complex   spaces.md')).toBe('complex-spaces');
    });

    it('should handle files without extensions', () => {
      expect(generatePromptId('test-file')).toBe('test-file');
      expect(generatePromptId('/path/to/test-file')).toBe('test-file');
    });
  });

  describe('frontmatterToPromptConfig', () => {
    it('should convert valid frontmatter to PromptConfig', () => {
      const frontmatter = {
        title: 'Test Prompt',
        description: 'A test prompt',
        category: 'Analysis',
        arguments: [{ name: 'input', description: 'Input text', required: true }],
      };

      const result = frontmatterToPromptConfig(frontmatter, 'test.md');

      expect(result?.id).toBe('test');
      expect(result?.name).toBe('Test Prompt');
      expect(result?.description).toBe('A test prompt');
      expect(result?.category).toBe('Analysis');
      expect(result?.requiredTools).toEqual([]);
      expect(Object.keys(result!.arguments)).toEqual(['input']);
      expect(getSchemaDescription(result!.arguments.input)).toBe('Input text');
      // required: true means it should NOT be optional
      expect(isSchemaOptional(result!.arguments.input)).toBe(false);
    });

    it('should return null for missing required fields', () => {
      const frontmatter = { title: 'Test' } as any;
      const result = frontmatterToPromptConfig(frontmatter, 'test.md');
      expect(result).toBe(null);
    });

    it('should treat arguments as required by default when required is not specified', () => {
      const frontmatter = {
        title: 'Test',
        description: 'Test desc',
        category: 'Analysis',
        arguments: [{ name: 'input', description: 'Input' }],
      };

      const result = frontmatterToPromptConfig(frontmatter, 'test.md');
      // When required is not specified (undefined), arg.required === false is false,
      // so the schema is NOT wrapped with .optional() — it stays required
      expect(isSchemaOptional(result!.arguments.input)).toBe(false);
    });

    it('should make arguments optional when required is false', () => {
      const frontmatter = {
        title: 'Test',
        description: 'Test desc',
        category: 'Analysis',
        arguments: [{ name: 'input', description: 'Input', required: false }],
      };

      const result = frontmatterToPromptConfig(frontmatter, 'test.md');
      expect(isSchemaOptional(result!.arguments.input)).toBe(true);
    });

    it('should handle missing arguments', () => {
      const frontmatter = {
        title: 'Test',
        description: 'Test desc',
        category: 'Analysis',
      };

      const result = frontmatterToPromptConfig(frontmatter, 'test.md');
      expect(result?.arguments).toEqual({});
      expect(result?.requiredTools).toEqual([]);
    });

    it('should handle arguments with enum values', () => {
      const frontmatter = {
        title: 'Test',
        description: 'Test desc',
        category: 'Analysis',
        arguments: [
          {
            name: 'level',
            description: 'Analysis level',
            enum: ['shallow', 'deep'],
          },
        ],
      };

      const result = frontmatterToPromptConfig(frontmatter, 'test.md');
      expect(Object.keys(result!.arguments)).toEqual(['level']);
      expect(getSchemaDescription(result!.arguments.level)).toBe('Analysis level');
      // Verify the enum values are embedded in the schema
      const levelSchema = result!.arguments.level as any;
      expect(levelSchema._def.values).toEqual(['shallow', 'deep']);
    });

    it('should handle mcp_tools frontmatter option', () => {
      const frontmatter = {
        title: 'Test',
        description: 'Test desc',
        category: 'Analysis',
        mcp_tools: ['github', 'datadog'],
      };

      const result = frontmatterToPromptConfig(frontmatter, 'test.md');
      expect(result?.requiredTools).toEqual(['github', 'datadog']);
    });

    it('should default requiredTools to empty array when mcp_tools not specified', () => {
      const frontmatter = {
        title: 'Test',
        description: 'Test desc',
        category: 'Analysis',
      };

      const result = frontmatterToPromptConfig(frontmatter, 'test.md');
      expect(result?.requiredTools).toEqual([]);
    });
  });

  describe('matchesIncludePatterns', () => {
    it('should return true when no patterns provided', () => {
      expect(matchesIncludePatterns('any/file.md')).toBe(true);
      expect(matchesIncludePatterns('any/file.md', [])).toBe(true);
    });

    it('should match against patterns', () => {
      expect(matchesIncludePatterns('docs/test.md', ['docs/**'])).toBe(true);
      expect(matchesIncludePatterns('src/test.md', ['docs/**'])).toBe(false);
      expect(matchesIncludePatterns('test.md', ['*.md'])).toBe(true);
      expect(matchesIncludePatterns('test.txt', ['*.md'])).toBe(false);
    });

    it('should handle multiple patterns', () => {
      const patterns = ['docs/**', 'templates/**'];
      expect(matchesIncludePatterns('docs/test.md', patterns)).toBe(true);
      expect(matchesIncludePatterns('templates/test.md', patterns)).toBe(true);
      expect(matchesIncludePatterns('src/test.md', patterns)).toBe(false);
    });
  });

  describe('parseMarkdownContent', () => {
    it('should parse valid markdown content with MCP compatible frontmatter', () => {
      const content = `---
title: Test Prompt
description: A test prompt
category: Analysis
mcp_compatible: true
arguments:
  - name: input
    description: Input text
    required: true
---
This is the body with {{input}}.`;

      const result = parseMarkdownContent(content, '/test/prompt.md');

      expect(result.config?.id).toBe('prompt');
      expect(result.config?.name).toBe('Test Prompt');
      expect(result.config?.description).toBe('A test prompt');
      expect(result.config?.category).toBe('Analysis');
      expect(result.config?.requiredTools).toEqual([]);
      expect(Object.keys(result.config!.arguments)).toEqual(['input']);
      expect(getSchemaDescription(result.config!.arguments.input)).toBe('Input text');
      expect(isSchemaOptional(result.config!.arguments.input)).toBe(false);
      expect(result.content).toBe('This is the body with {{input}}.');
    });

    it('should skip non-MCP compatible prompts', () => {
      const content = `---
title: Test
description: Test
category: Analysis
mcp_compatible: false
---
Body content.`;

      const result = parseMarkdownContent(content, '/test/prompt.md');
      expect(result.config).toBe(null);
      expect(result.content).toBe('Body content.');
    });

    it('should handle content without frontmatter', () => {
      const content = 'Just markdown content.';
      const result = parseMarkdownContent(content, '/test/prompt.md');
      expect(result.config).toBe(null);
      expect(result.content).toBe('Just markdown content.');
    });

    it('should handle malformed frontmatter', () => {
      const content = `---
invalid: [unclosed array
---
Content here.`;

      const result = parseMarkdownContent(content, '/test/prompt.md');
      expect(result.config).toBe(null);
      expect(result.content).toBe(content);
    });

    it('should handle missing required frontmatter fields', () => {
      const content = `---
title: Incomplete
mcp_compatible: true
---
Missing description and category.`;

      const result = parseMarkdownContent(content, '/test/prompt.md');
      expect(result.config).toBe(null);
      expect(result.content).toBe('Missing description and category.');
    });

    it('should default mcp_compatible to true when not specified', () => {
      const content = `---
title: Test Prompt
description: A test prompt
category: Analysis
---
Should be MCP compatible by default.`;

      const result = parseMarkdownContent(content, '/test/prompt.md');
      expect(result.config).not.toBe(null);
      expect(result.config?.name).toBe('Test Prompt');
      expect(result.config?.requiredTools).toEqual([]);
    });
  });

  describe('findMarkdownFiles', () => {
    it('should find the template file', () => {
      const templatesDir = mockPath.realPath.resolve(__dirname, '../../../templates');
      const files = findMarkdownFiles(templatesDir);

      expect(files).toContain(templatePath);
    });

    it('should filter files by patterns', () => {
      const templatesDir = mockPath.realPath.resolve(__dirname, '../../../templates');
      const files = findMarkdownFiles(templatesDir, ['**/prompt-template.md']);

      expect(files).toContain(templatePath);
      expect(files.every((file) => file.includes('prompt-template.md'))).toBe(true);
    });

    it('should return empty array for non-existent directory', () => {
      const files = findMarkdownFiles('/non/existent/path');
      expect(files).toEqual([]);
    });

    it('should handle pattern that matches no files', () => {
      const templatesDir = mockPath.realPath.resolve(__dirname, '../../../templates');
      const files = findMarkdownFiles(templatesDir, ['**/non-existent.md']);

      expect(files).toEqual([]);
    });
  });

  describe('parseMarkdownPrompt', () => {
    it('should parse the template file', () => {
      const result = parseMarkdownPrompt(templatePath);

      expect(result.config).not.toBe(null);
      expect(result.config?.name).toBe('Code Security Analysis');
      expect(result.config?.description).toBe('Sample code security review prompt');
      expect(result.config?.category).toBe('Analysis');
      expect(result.config?.requiredTools).toEqual(['']);

      const argKeys = Object.keys(result.config!.arguments);
      expect(argKeys).toContain('paths');
      expect(argKeys).toContain('level');
      expect(isSchemaOptional(result.config!.arguments.paths)).toBe(false);
      expect(isSchemaOptional(result.config!.arguments.level)).toBe(false);

      expect(result.content).toContain('You are a security expert');
      expect(result.content).toContain('{{level}}');
      expect(result.content).toContain('{{paths}}');
    });

    it('should handle non-existent file', () => {
      const result = parseMarkdownPrompt('/non/existent/file.md');

      expect(result.config).toBe(null);
      expect(result.content).toBe('');
    });

    it('should handle file read permissions errors', () => {
      // Test with a directory instead of a file to trigger an error
      const result = parseMarkdownPrompt('/');

      expect(result.config).toBe(null);
      expect(result.content).toBe('');
    });
  });
});
