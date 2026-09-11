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
const resourcesDir = path.join(rootDir, 'src', 'resources');
const templatePath = path.join(rootDir, 'templates', 'resource-template.ts.tmpl');

// Example categories based on common resource organization
// TODO: make this sync with registry categories
const exampleCategories = ['Documentation', 'Code', 'Reference', 'Data'];

// Validate resource ID
function validateId(id) {
  if (!id || id.trim() === '') return 'Resource ID cannot be empty';
  if (!/^[a-z0-9-]+$/.test(id))
    return 'Resource ID must contain only lowercase letters, numbers, and hyphens';
  if (fs.existsSync(path.join(resourcesDir, id)))
    return `Resource with ID '${id}' already exists`;
  return true;
}

// Convert a string to PascalCase for class name
export function toPascalCase(str) {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => word.toUpperCase())
    .replace(/[^a-zA-Z0-9]+/g, '');
}

// Generate default class name from resource ID
export function generateDefaultClassName(resourceId) {
  return `${toPascalCase(resourceId)}Resource`;
}

// Main function to create a new resource
async function createNewResource() {
  console.log('\n🔨 Create New Resource\n');

  try {
    // Prompt for resource information using inquirer
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'id',
        message: 'Resource ID (lowercase, use hyphens):',
        validate: validateId,
        filter: (input) => input.toLowerCase().trim()
      },
      {
        type: 'input',
        name: 'name',
        message: 'Resource Name (user-facing):',
        validate: (input) => input.trim() !== '' || 'Name cannot be empty'
      },
      {
        type: 'input',
        name: 'description',
        message: 'Resource Description (user-facing, clear and concise):',
        validate: (input) =>
          input.trim() !== '' || 'Description cannot be empty'
      },
      {
        type: 'list',
        name: 'category',
        message: 'Resource Category:',
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
      }
    ]);

    // Process the answers
    const resourceId = answers.id;
    const resourceName = answers.name;
    const resourceDescription = answers.description;
    const resourceCategory =
      answers.category === '_custom'
        ? answers.customCategory
        : answers.category;
    const resourceClassName = answers.className;

    // Calculate brief description for the class comment (first sentence)
    const briefDescription = resourceDescription.split('.')[0].trim();

    // Create the new resource directory
    const newResourceDir = path.join(resourcesDir, resourceId);
    fs.mkdirSync(newResourceDir, { recursive: true });

    // Read the resource template file
    const resourceTemplateContent = fs.readFileSync(templatePath, 'utf8');

    // Read the test template file
    const testTemplatePath = path.join(
      rootDir,
      'templates',
      'resource-test-template.ts.tmpl'
    );
    const testTemplateContent = fs.readFileSync(testTemplatePath, 'utf8');

    // Replace placeholders with actual values for the resource file
    const resourceContent = resourceTemplateContent
      .replace(/{{RESOURCE_ID}}/g, resourceId)
      .replace(/{{RESOURCE_NAME}}/g, resourceName)
      .replace(/{{RESOURCE_DESCRIPTION}}/g, resourceDescription)
      .replace(/{{RESOURCE_DESCRIPTION_BRIEF}}/g, briefDescription)
      .replace(/{{RESOURCE_CATEGORY}}/g, resourceCategory)
      .replace(/{{RESOURCE_CLASS_NAME}}/g, resourceClassName);

    // Replace placeholders with actual values for the test file
    const testContent = testTemplateContent.replace(
      /{{RESOURCE_CLASS_NAME}}/g,
      resourceClassName
    );

    // Write the new resource file
    const outputFile = path.join(newResourceDir, 'index.ts');
    fs.writeFileSync(outputFile, resourceContent);

    // Write the test file
    const testFile = path.join(newResourceDir, 'index.test.ts');
    fs.writeFileSync(testFile, testContent);

    console.log(`\n✅ Resource created successfully at: ${outputFile}`);
    console.log(`✅ Test file created at: ${testFile}`);

    // Update the resource loader
    console.log('\n🔄 Updating resource loader...');
    try {
      execSync('node scripts/generate-resource-loader.js', { cwd: rootDir });
      console.log('✅ Resource loader updated');
    } catch (error) {
      console.error('❌ Failed to update resource loader:', error);
    }

    console.log(`
  🚀 Next steps:
    1. Customize your resource implementation in: ${outputFile}
    2. Add specific parameters to your resource
    3. Update the test cases in: ${testFile}
    4. Run tests with: bun run test ${testFile.replace(/\\/g, '/')}
    5. Run the server to test your resource
  `);
  } catch (error) {
    console.error('Error creating resource:', error);
    process.exit(1);
  }
}

// Run the resource creation process
createNewResource();
