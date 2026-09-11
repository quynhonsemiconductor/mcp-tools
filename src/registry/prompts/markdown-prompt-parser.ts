import { ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import fs from 'fs';
import yaml from 'js-yaml';
import { minimatch } from 'minimatch';
import path from 'path';
import z from 'zod';
import { logDebug, logWarn } from '../../services/logger';
import { PromptConfig } from './types';

interface MarkdownFrontmatter {
  title: string;
  description: string;
  category: string;
  mcp_compatible?: boolean;
  mcp_tools?: string[]; // TODO: process and verify tools are available
  author?: string;
  created?: string;
  updated?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
    enum?: string[];
  }>;
}

/**
 * Parse frontmatter from markdown content
 */
export function parseFrontmatter(content: string): {
  frontmatter: MarkdownFrontmatter | null;
  body: string;
} {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: null, body: content };
  }

  try {
    const frontmatter = yaml.load(match[1]) as MarkdownFrontmatter;
    const body = match[2];
    return { frontmatter, body };
  } catch (error) {
    logWarn(`Failed to parse YAML frontmatter: ${error}`);
    return { frontmatter: null, body: content };
  }
}

/**
 * Generate prompt ID from filename
 */
export function generatePromptId(filename: string): string {
  const basename = path.basename(filename, '.md');
  return basename.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Convert frontmatter to PromptConfig
 */
export function frontmatterToPromptConfig(
  frontmatter: MarkdownFrontmatter,
  filename: string,
): PromptConfig | null {
  try {
    // Validate required fields
    if (!frontmatter.title || !frontmatter.description || !frontmatter.category) {
      logWarn(`Missing required frontmatter fields in ${filename}`);
      return null;
    }

    // Generate ID from filename
    const id = generatePromptId(filename);

    // Convert arguments
    const promptArguments: ZodRawShapeCompat =
      frontmatter.arguments?.reduce<ZodRawShapeCompat>((acc, arg) => {
        let zSchema: z.ZodTypeAny = z.string();
        if (arg.enum && arg.enum.length > 0) {
          zSchema = z.enum(arg.enum);
        }
        if (arg.description) {
          zSchema = zSchema.describe(arg.description);
        }
        if (arg.required === false) {
          zSchema = zSchema.optional();
        }
        acc[arg.name] = zSchema;

        return acc;
      }, {}) || {};

    return {
      id,
      name: frontmatter.title,
      description: frontmatter.description,
      category: frontmatter.category,
      requiredTools: frontmatter.mcp_tools || [],
      arguments: promptArguments,
    };
  } catch (error) {
    logWarn(`Failed to convert frontmatter to PromptConfig for ${filename}: ${error}`);
    return null;
  }
}

/**
 * Check if a file path matches the include patterns
 */
export function matchesIncludePatterns(filePath: string, includePatterns?: string[]): boolean {
  if (!includePatterns || includePatterns.length === 0) {
    return true; // Include all if no patterns specified
  }

  return includePatterns.some((pattern) => minimatch(filePath, pattern));
}

/**
 * Find all markdown files in a directory recursively
 */
export function findMarkdownFiles(dirPath: string, includePatterns?: string[]): string[] {
  const markdownFiles: string[] = [];

  function walkDir(currentPath: string) {
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(dirPath, fullPath);

        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          if (matchesIncludePatterns(relativePath, includePatterns)) {
            markdownFiles.push(fullPath);
          } else {
            logDebug(`Skipping ${relativePath} - doesn't match include patterns`);
          }
        }
      }
    } catch (error) {
      logWarn(`Failed to read directory ${currentPath}: ${error}`);
    }
  }

  walkDir(dirPath);
  return markdownFiles;
}

/**
 * Parse markdown content and extract prompt configuration
 * This function takes content as a string, making it easily testable
 */
export function parseMarkdownContent(
  content: string,
  filename: string,
): {
  config: PromptConfig | null;
  content: string;
} {
  const { frontmatter, body } = parseFrontmatter(content);

  if (!frontmatter) {
    logWarn(`No frontmatter found in ${filename}`);
    return { config: null, content: body };
  }

  // Check if MCP compatible
  if (frontmatter.mcp_compatible === false) {
    logDebug(`Skipping ${filename} - not MCP compatible`);
    return { config: null, content: body };
  }

  const config = frontmatterToPromptConfig(frontmatter, filename);
  return { config, content: body };
}

/**
 * Parse a markdown file and extract prompt configuration
 * This function handles file I/O and delegates to parseMarkdownContent
 */
export function parseMarkdownPrompt(filePath: string): {
  config: PromptConfig | null;
  content: string;
} {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseMarkdownContent(content, filePath);
  } catch (error) {
    logWarn(`Failed to parse markdown file ${filePath}: ${error}`);
    return { config: null, content: '' };
  }
}
