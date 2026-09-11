import { PromptHandler } from './types';

/**
 * Generic handler for markdown-based prompts
 */
export class MarkdownPromptHandler implements PromptHandler {
  private content: string;

  constructor(content: string) {
    this.content = content;
  }

  /**
   * Load the prompt with the given arguments
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- implements a Promise-returning interface; async is required by the contract even without an await
  async load(args: unknown): Promise<string> {
    let result = this.content;

    // Narrow args to a plain record of values we can stringify into the template
    const argsRecord: Record<string, unknown> =
      args && typeof args === 'object' ? (args as Record<string, unknown>) : {};

    // Replace template variables with actual values
    for (const [key, value] of Object.entries(argsRecord)) {
      // Handle both simple variables {{ key }} and variables with defaults {{ key || "default" }}
      const simpleRegex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      const defaultRegex = new RegExp(`{{\\s*${key}\\s*\\|\\|\\s*[^}]+\\s*}}`, 'g');

      result = result.replace(simpleRegex, String(value));
      result = result.replace(defaultRegex, String(value));
    }

    // Handle variables with defaults where the variable is not provided in args
    result = result.replace(
      /\{\{\s*(\w+)\s*\|\|\s*([^}]+?)\s*\}\}/g,
      (_match, varName: string, defaultValue: string) => {
        if (varName in argsRecord) {
          return String(argsRecord[varName]);
        }
        // Remove quotes from default value if present (both single and double quotes)
        return defaultValue.trim().replace(/^["'](.*)["']$/, '$1');
      },
    );

    return result;
  }
}
