import { describe, expect, it } from 'bun:test';
import { MarkdownPromptHandler } from './markdown-prompt-handler';

describe('MarkdownPromptHandler', () => {
  describe('load', () => {
    it('should return content as-is when no template variables', async () => {
      const handler = new MarkdownPromptHandler('This is a simple prompt.');
      const result = await handler.load({});

      expect(result).toBe('This is a simple prompt.');
    });

    it('should replace single template variable', async () => {
      const handler = new MarkdownPromptHandler('Hello {{name}}!');
      const result = await handler.load({ name: 'World' });

      expect(result).toBe('Hello World!');
    });

    it('should replace multiple template variables', async () => {
      const handler = new MarkdownPromptHandler('Analyze {{paths}} with {{level}} analysis.');
      const result = await handler.load({
        paths: '/src/components',
        level: 'deep',
      });

      expect(result).toBe('Analyze /src/components with deep analysis.');
    });

    it('should handle template variables with spaces', async () => {
      const handler = new MarkdownPromptHandler('Value: {{ variable }}');
      const result = await handler.load({ variable: 'test' });

      expect(result).toBe('Value: test');
    });

    it('should replace multiple occurrences of same variable', async () => {
      const handler = new MarkdownPromptHandler('{{name}} said {{name}} is great!');
      const result = await handler.load({ name: 'Alice' });

      expect(result).toBe('Alice said Alice is great!');
    });

    it('should convert non-string values to strings', async () => {
      const handler = new MarkdownPromptHandler('Count: {{count}}');
      const result = await handler.load({ count: 42 });

      expect(result).toBe('Count: 42');
    });

    it('should handle missing arguments gracefully', async () => {
      const handler = new MarkdownPromptHandler('Hello {{name}}!');
      const result = await handler.load({});

      expect(result).toBe('Hello {{name}}!');
    });

    it('should handle null/undefined args', async () => {
      const handler = new MarkdownPromptHandler('Hello {{name}}!');

      const result1 = await handler.load(null);
      expect(result1).toBe('Hello {{name}}!');

      const result2 = await handler.load(undefined);
      expect(result2).toBe('Hello {{name}}!');
    });

    it('should handle complex template with multiple variables', async () => {
      const content = `You are a security expert conducting a comprehensive security analysis of source code.

You will perform a {{level}} analysis of the code.

Analyze the following files and directories:
{{paths}}

Focus on: {{focus}}`;

      const handler = new MarkdownPromptHandler(content);
      const result = await handler.load({
        level: 'deep',
        paths: '/src/components\n/src/utils',
        focus: 'authentication and authorization',
      });

      const expected = `You are a security expert conducting a comprehensive security analysis of source code.

You will perform a deep analysis of the code.

Analyze the following files and directories:
/src/components
/src/utils

Focus on: authentication and authorization`;

      expect(result).toBe(expected);
    });

    it('should handle edge case with braces but no variables', async () => {
      const handler = new MarkdownPromptHandler('Use {brackets} but not {{variables}}.');
      const result = await handler.load({ variables: 'templates' });

      expect(result).toBe('Use {brackets} but not templates.');
    });

    it('should handle default values with double quotes', async () => {
      const handler = new MarkdownPromptHandler('Hello {{name || "World"}}!');
      const result = await handler.load({});

      expect(result).toBe('Hello World!');
    });

    it('should handle default values with single quotes', async () => {
      const handler = new MarkdownPromptHandler("Hello {{name || 'World'}}!");
      const result = await handler.load({});

      expect(result).toBe('Hello World!');
    });

    it('should use provided value over default value', async () => {
      const handler = new MarkdownPromptHandler('Hello {{name || "World"}}!');
      const result = await handler.load({ name: 'Alice' });

      expect(result).toBe('Hello Alice!');
    });

    it('should handle default values with spaces', async () => {
      const handler = new MarkdownPromptHandler('Status: {{ status || "not provided" }}');
      const result = await handler.load({});

      expect(result).toBe('Status: not provided');
    });

    it('should handle multiple variables with defaults', async () => {
      const handler = new MarkdownPromptHandler(
        'Hello {{name || "Anonymous"}}, your level is {{level || "beginner"}}.',
      );
      const result = await handler.load({ name: 'Bob' });

      expect(result).toBe('Hello Bob, your level is beginner.');
    });

    it('should handle mixed variables with and without defaults', async () => {
      const handler = new MarkdownPromptHandler(
        'User {{username}} has {{role || "user"}} permissions for {{resource}}.',
      );
      const result = await handler.load({
        username: 'john',
        resource: 'dashboard',
      });

      expect(result).toBe('User john has user permissions for dashboard.');
    });

    it('should handle default values without quotes', async () => {
      const handler = new MarkdownPromptHandler('Count: {{count || 0}}');
      const result = await handler.load({});

      expect(result).toBe('Count: 0');
    });

    it('should handle default values with complex strings', async () => {
      const handler = new MarkdownPromptHandler('Config: {{config || "development environment"}}');
      const result = await handler.load({});

      expect(result).toBe('Config: development environment');
    });

    it('should handle multiple occurrences of same variable with default', async () => {
      const handler = new MarkdownPromptHandler(
        '{{name || "User"}} said {{name || "User"}} is great!',
      );
      const result = await handler.load({});

      expect(result).toBe('User said User is great!');
    });

    it('should handle complex template with mixed variable types', async () => {
      const content = `Analysis for {{project || "unnamed project"}}

Level: {{level || "basic"}}
Files: {{files}}
Options: {{options || "default settings"}}`;

      const handler = new MarkdownPromptHandler(content);
      const result = await handler.load({
        files: '/src/main.js',
        level: 'advanced',
      });

      const expected = `Analysis for unnamed project

Level: advanced
Files: /src/main.js
Options: default settings`;

      expect(result).toBe(expected);
    });
  });
});
