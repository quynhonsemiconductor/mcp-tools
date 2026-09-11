#!/usr/bin/env bun

import { input, select } from '@inquirer/prompts';
import { execSync } from 'child_process';
import fs from 'fs';
import { select as multiSelect } from 'inquirer-select-pro';
import path from 'path';
import { fileURLToPath } from 'url';

import { ToolCategoryMap } from '../src/registry/types';

// Get the directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const toolsDir = path.join(rootDir, 'src', 'tools');
const templatePath = path.join(rootDir, 'templates', 'tool-template.ts.tmpl');
const setupTemplatePath = path.join(
  rootDir,
  'templates',
  'tool-setup-template.md.tmpl'
);
const categories = Object.keys(ToolCategoryMap) as string[];

/**
 * Validates the tool ID format and uniqueness
 * @param id - The tool ID to validate
 * @returns Validation result - true if valid, error message if invalid
 */
function validateId(id: string): string | true {
  if (!id || id.trim() === '') return 'Tool ID cannot be empty';
  if (!/^[a-z0-9-]+$/.test(id))
    return 'Tool ID must contain only lowercase letters, numbers, and hyphens';
  if (fs.existsSync(path.join(toolsDir, id)))
    return `Tool with ID '${id}' already exists`;
  return true;
}

/**
 * Converts a string to PascalCase for class naming
 * @param str - The string to convert
 * @returns PascalCase string
 */
function toPascalCase(str: string): string {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => word.toUpperCase())
    .replace(/[^a-zA-Z0-9]+/g, '');
}

/**
 * Generates a default class name from the tool ID
 * @param toolId - The tool ID
 * @returns Default class name
 */
function generateDefaultClassName(toolId: string): string {
  return `${toPascalCase(toolId)}Tool`;
}

interface ToolAnswers {
  id: string;
  name: string;
  description: string;
  category: string;
  customCategory?: string;
  version: string;
  className: string;
}

/**
 * Main function to create a new tool
 */
async function createNewTool(): Promise<void> {
  console.log('\n🔨 Create New Tool\n');

  try {
    // Prompt for tool information using single step inquirer style

    // Tool ID
    const toolId = await input({
      message: 'Tool ID (lowercase, use hyphens, ex: github-get-pr):',
      validate: validateId,
      transformer: (input: string) => input.toLowerCase().trim()
    });

    // Human Name
    const humanName = await input({
      message: "Human-friendly title that clearly describe the tool's purpose",
      validate: (input: string) =>
        input.trim() !== '' ? true : 'Title cannot be empty'
    });

    // Tool Name
    const toolName = await input({
      message: 'Tool Name (use camelCase, ex getGithubPR):',
      validate: (input: string) =>
        input.trim() !== '' ? true : 'Name cannot be empty'
    });

    // Description
    const toolDescription = await input({
      message: 'Tool Description (user-facing, clear and concise):',
      validate: (input: string) =>
        input.trim() !== '' ? true : 'Description cannot be empty'
    });

    // Annotations
    const annotations = await multiSelect({
      message:
        'Tool Annotations (provide additional metadata about a tool’s behavior):',
      multiple: true,
      options: [
        { value: 'readOnlyHint', name: 'Read-Only' },
        { value: 'destructiveHint', name: 'Destructive' },
        { value: 'idempotentHint', name: 'Idempotent' },
        { value: 'openWorldHint', name: 'Open World' }
      ]
    });

    const toolCategory = await select({
      message: 'Tool Category:',
      choices: categories.map((cat) => ({ value: cat, name: cat }))
    });

    // Subdirectory for specific categories
    // TODO: subdirectory classes get the wrong imports (need an extra ../)
    // TODO: this could be dynamic, but needs to include the root option for "none"
    let subdirectory = '';
    if (toolCategory === 'Slack') {
      const slackSubdirs = ['channels', 'messages', 'users', 'root'];
      const selectedSubdir = await select({
        message: 'Slack Tool Subdirectory:',
        choices: slackSubdirs.map((subdir) => ({
          value: subdir === 'root' ? '' : subdir,
          name: subdir === 'root' ? 'Root (no subdirectory)' : subdir
        }))
      });
      subdirectory = selectedSubdir;
    } else if (toolCategory.startsWith('Github:')) {
      const githubSubdirs = [
        'actions',
        'dependabot',
        'discussions',
        'gists',
        'repos',
        'branches',
        'issues',
        'orgs',
        'pulls',
        'releases',
        'search',
        'root'
      ];
      const selectedSubdir = await select({
        message: 'GitHub Tool Subdirectory:',
        choices: githubSubdirs.map((subdir) => ({
          value: subdir === 'root' ? '' : subdir,
          name: subdir === 'root' ? 'Root (no subdirectory)' : subdir
        }))
      });
      subdirectory = selectedSubdir;
    }

    // Class Name
    const defaultClassName = generateDefaultClassName(toolId);
    const toolClassName = await input({
      message: 'Class Name:',
      default: defaultClassName,
      validate: (input: string) =>
        /^[A-Z][a-zA-Z0-9]*$/.test(input)
          ? true
          : 'Class name must be PascalCase and start with a capital letter'
    });

    // Calculate brief description for the class comment (first sentence)
    const briefDescription = toolDescription.split('.')[0].trim();

    const toolCategoryDir =
      ToolCategoryMap[toolCategory as keyof typeof ToolCategoryMap];

    // Create the new tool directory (with subdirectory if specified)
    const newToolDir = subdirectory
      ? path.join(toolsDir, toolCategoryDir, subdirectory)
      : path.join(toolsDir, toolCategoryDir);
    fs.mkdirSync(newToolDir, { recursive: true });

    // Read the tool template file
    const toolTemplateContent = fs.readFileSync(templatePath, 'utf8');

    // Read the test template file
    const testTemplatePath = path.join(
      rootDir,
      'templates',
      'tool-test-template.ts.tmpl'
    );
    const testTemplateContent = fs.readFileSync(testTemplatePath, 'utf8');

    // Replace placeholders with actual values for the tool file
    const toolContent = toolTemplateContent
      .replace(/{{TOOL_ID}}/g, toolId)
      .replace(/{{TOOL_NAME}}/g, toolName)
      .replace(/{{TOOL_DESCRIPTION}}/g, toolDescription)
      .replace(/{{TOOL_DESCRIPTION_BRIEF}}/g, briefDescription)
      .replace(/{{TOOL_CATEGORY}}/g, toolCategory)
      .replace(/{{TOOL_CLASS_NAME}}/g, toolClassName)
      .replace(/{{TOOL_VERSION}}/g, '1.0.0') // Default version, can be customized later
      .replace(/{{UI_NAME}}/g, humanName)
      .replace(
        /{{TOOL_ANNOTATIONS}}/g,
        annotations.length
          ? annotations.map((a) => `${a}: true`).join(',\n    ')
          : ''
      );

    // Replace placeholders with actual values for the test file
    const testContent = testTemplateContent.replace(
      /{{TOOL_CLASS_NAME}}/g,
      toolClassName
    );

    // Write the new tool file
    const outputFile = path.join(newToolDir, `${toolId}-tool.ts`);
    fs.writeFileSync(outputFile, toolContent);

    // Write the test file
    const testFile = path.join(newToolDir, `${toolId}-tool.test.ts`);
    fs.writeFileSync(testFile, testContent);

    // Read the SETUP.md template
    const setupTemplateContent = fs.readFileSync(setupTemplatePath, 'utf8');

    // Replace placeholders in SETUP.md template
    const setupContent = setupTemplateContent
      .replace(/\[Tool Name\]/g, humanName)
      .replace(
        /\[Brief description of what the tool does and its purpose\. Include key capabilities and use cases\.\]/g,
        toolDescription
      );

    // Write the SETUP.md file
    const setupFile = path.join(newToolDir, 'SETUP.md');
    fs.writeFileSync(setupFile, setupContent);

    console.log(`\n✅ Tool created successfully at: ${outputFile}`);
    console.log(`✅ Test file created at: ${testFile}`);
    console.log(`✅ Setup documentation created at: ${setupFile}`);

    // Update the tool loader
    console.log('\n🔄 Updating tool loader...');
    try {
      execSync('bun run generate:tools', { cwd: rootDir });
      console.log('✅ Tool loader updated');
    } catch (error) {
      console.error('❌ Failed to update tool loader:', error);
    }

    console.log(`
  🚀 Next steps:
    1. Customize your tool implementation in: ${outputFile}
    2. Add specific parameters to your tool's schema
    3. Complete the setup documentation in: ${setupFile}
       - Add required environment variables to the Secrets table
       - Update prerequisites and troubleshooting sections
       - Add links to official documentation
    4. Update the test cases in: ${testFile}
    5. Run tests with: bun run test ${testFile.replace(/\\/g, '/')}
    6. Run the server to test your tool
  `);
  } catch (error) {
    console.error('Error creating tool:', error);
    process.exit(1);
  }
}

// Run the tool creation process
console.log('🛠️  Starting tool creation process...');
createNewTool();
