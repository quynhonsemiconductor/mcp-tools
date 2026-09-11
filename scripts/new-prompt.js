#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import inquirer from 'inquirer';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const promptsDir = path.join(rootDir, 'src', 'prompts');
const templatePath = path.join(rootDir, 'templates', 'prompt-template.ts.tmpl');

// Example categories based on common prompt organization
// TODO: make this sync with registry categories
const exampleCategories = ['Documentation', 'Code', 'Analysis'];

// Validate prompt ID
function validateId(id) {
  if (!id || id.trim() === '') return 'Prompt ID cannot be empty';
  if (!/^[a-z0-9-]+$/.test(id))
    return 'Prompt ID must contain only lowercase letters, numbers, and hyphens';
  if (fs.existsSync(path.join(promptsDir, id)))
    return `Prompt with ID '${id}' already exists`;
  return true;
}

// Convert a string to PascalCase for class name
export function toPascalCase(str) {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => word.toUpperCase())
    .replace(/[^a-zA-Z0-9]+/g, '');
}

// Generate default class name from tool ID
export function generateDefaultClassName(toolId) {
  return `${toPascalCase(toolId)}Prompt`;
}

// Main function to create a new prompt
async function createNewPrompt() {
  console.log('\n🔨 Create New Prompt\n');

  try {
    // Prompt for prompt information using inquirer
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'id',
        message: 'Prompt ID (lowercase, use hyphens):',
        validate: validateId,
        filter: (input) => input.toLowerCase().trim()
      },
      {
        type: 'input',
        name: 'name',
        message: 'Prompt Name (user-facing):',
        validate: (input) => input.trim() !== '' || 'Name cannot be empty'
      },
      {
        type: 'input',
        name: 'description',
        message: 'Prompt Description (user-facing, clear and concise):',
        validate: (input) =>
          input.trim() !== '' || 'Description cannot be empty'
      },
      {
        type: 'list',
        name: 'category',
        message: 'Prompt Category:',
        choices: [
          ...exampleCategories,
          new inquirer.Separator(),
          {
            name: 'Custom category...',
            value: '_custom'
          }
        ]
      },
      {
        type: 'input',
        name: 'customCategory',
        message: 'Enter custom category:',
        when: (answers) => answers.category === '_custom',
        validate: (input) => input.trim() !== '' || 'Category cannot be empty'
      },
      {
        type: 'input',
        name: 'className',
        message: 'Class Name:',
        default: (answers) => generateDefaultClassName(answers.id),
        validate: (input) =>
          /^[A-Z][a-zA-Z0-9]*$/.test(input) ||
          'Class name must be PascalCase and start with a capital letter'
      },
    ]);

    // Process the answers
    const promptId = answers.id;
    const promptName = answers.name;
    const promptDescription = answers.description;
    const promptCategory =
      answers.category === '_custom'
        ? answers.customCategory
        : answers.category;
    const promptClassName = answers.className;

    // Calculate brief description for the class comment (first sentence)
    const briefDescription = promptDescription.split('.')[0].trim();

    // Create the new prompt directory
    const newPromptDir = path.join(promptsDir, promptId);
    fs.mkdirSync(newPromptDir, { recursive: true });

    // Read the prompt template file
    const promptTemplateContent = fs.readFileSync(templatePath, 'utf8');

    // Read the test template file
    const testTemplatePath = path.join(
      rootDir,
      'templates',
      'prompt-test-template.ts.tmpl'
    );
    const testTemplateContent = fs.readFileSync(testTemplatePath, 'utf8');

    // Replace placeholders with actual values for the prompt file
    const promptContent = promptTemplateContent
      .replace(/{{PROMPT_ID}}/g, promptId)
      .replace(/{{PROMPT_NAME}}/g, promptName)
      .replace(/{{PROMPT_DESCRIPTION}}/g, promptDescription)
      .replace(/{{PROMPT_DESCRIPTION_BRIEF}}/g, briefDescription)
      .replace(/{{PROMPT_CATEGORY}}/g, promptCategory)
      .replace(/{{PROMPT_CLASS_NAME}}/g, promptClassName)

    // Replace placeholders with actual values for the test file
    const testContent = testTemplateContent.replace(
      /{{PROMPT_CLASS_NAME}}/g,
      promptClassName
    );

    // Write the new prompt file
    const outputFile = path.join(newPromptDir, 'index.ts');
    fs.writeFileSync(outputFile, promptContent);

    // Write the test file
    const testFile = path.join(newPromptDir, 'index.test.ts');
    fs.writeFileSync(testFile, testContent);

    console.log(`\n✅ Prompt created successfully at: ${outputFile}`);
    console.log(`✅ Test file created at: ${testFile}`);

    // Update the prompt loader
    console.log('\n🔄 Updating prompt loader...');
    try {
      execSync('node scripts/generate-prompt-loader.js', { cwd: rootDir });
      console.log('✅ Prompt loader updated');
    } catch (error) {
      console.error('❌ Failed to update prompt loader:', error);
    }

    console.log(`
  🚀 Next steps:
    1. Customize your prompt implementation in: ${outputFile}
    2. Add specific parameters to your prompt
    3. Update the test cases in: ${testFile}
    4. Run tests with: bun run test ${testFile.replace(/\\/g, '/')}
    5. Run the server to test your prompt
  `);
  } catch (error) {
    console.error('Error creating prompt:', error);
    process.exit(1);
  }
}

// Run the prompt creation process
createNewPrompt();
