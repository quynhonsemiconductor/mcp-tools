#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const promptsDir = path.join(rootDir, 'src', 'prompts');
const outputFile = path.join(rootDir, 'src', 'registry', 'prompts-loader.ts');

/**
 * Find all prompt files in the prompts directory
 * This includes files that likely contain prompt definitions
 */
function findPromptFiles(dir, promptFiles = []) {
  if (!fs.existsSync(dir)) {
    return promptFiles;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    // Skip loader.ts and node_modules
    if (entry.name === 'loader.ts' || entry.name === 'node_modules') {
      continue;
    }

    if (entry.isDirectory()) {
      // Recursively search subdirectories
      findPromptFiles(entryPath, promptFiles);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('Prompt.ts') ||
        entry.name.endsWith('Prompt.js') ||
        entry.name.endsWith('-prompt.ts') ||
        entry.name.endsWith('-prompt.js') ||
        entry.name === 'index.ts' ||
        entry.name === 'index.js')
    ) {
      // Found a potential prompt file
      const relativePath = path.relative(promptsDir, entryPath);
      promptFiles.push(relativePath);
    }
  }

  return promptFiles;
}

/**
 * Generate import statements for each prompt file
 */
function generateImports(promptFiles) {
  return promptFiles
    .map((file) => {
      // Convert from absolute path to relative import path
      let importPath = '../prompts/' + file.replace(/\\/g, '/');
      // Remove file extension
      importPath = importPath.replace(/\.(ts|js)$/, '');
      return `import '${importPath}';`;
    })
    .join('\n');
}

/**
 * Updates content between marker comments in a file
 * @param {string} content - The file content
 * @param {string} startMarker - The start marker comment
 * @param {string} endMarker - The end marker comment
 * @param {string} newContent - The new content to insert between markers
 * @returns {string} Updated content or original content if markers not found
 */
function updateContentBetweenMarkers(
  content,
  startMarker,
  endMarker,
  newContent
) {
  // Check if the markers exist in the content
  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker);

  if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
    // Replace the content between the markers
    const beforeMarker = content.substring(0, startIndex + startMarker.length);
    const afterMarker = content.substring(endIndex);
    return beforeMarker + '\n' + newContent + '\n' + afterMarker;
  }

  // Return original content if markers not found
  return content;
}

/**
 * Check if a file contains the @Prompt decorator
 */
function hasPromptDecorator(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    // Check for @Prompt( pattern which indicates the decorator
    return content.includes('@Prompt(');
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return false;
  }
}

/**
 * Extract prompt information by parsing the content of a prompt file
 * Now processes multiple @Prompt decorators in a single file
 */
function extractPromptInfo(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const results = [];

    // Extract information from all Prompt decorators using global flag
    const decoratorRegex = /@Prompt\({([\s\S]*?)\}\)/gs;
    let match;

    // Find all instances of @Prompt decorators in the file
    while ((match = decoratorRegex.exec(content)) !== null) {
      const decoratorContent = match[1];

      // Extract properties
      const idMatch = decoratorContent.match(/id:\s*['"]([^'"]+)['"]/);
      const nameMatch = decoratorContent.match(/name:\s*['"]([^'"]+)['"]/);
      const categoryMatch = decoratorContent.match(
        /category:\s*['"]([^'"]+)['"]/
      );

      // Skip this decorator if it doesn't have required fields
      if (!idMatch || !nameMatch || !categoryMatch) continue;

      // Handle both single-line and multiline description strings
      let descriptionText = '';
      let descriptionMatch = decoratorContent.match(
        /description:\s*((?:`(?:[^`]+)`|['"](?:[^'"]+)['"](?:\s*\+\s*['"](?:[^'"]+)['"])*)\s*,)/s
      );

      if (descriptionMatch) {
        const descriptionStr = descriptionMatch[1].trim().slice(0, -1); // Remove trailing comma

        // Check if it's a template literal
        if (descriptionStr.startsWith('`') && descriptionStr.endsWith('`')) {
          descriptionText = descriptionStr.slice(1, -1);
        }
        // Check if it's a concatenated string
        else if (descriptionStr.includes('+')) {
          const concatenatedParts = descriptionStr.split('+').map((part) => {
            const trimmed = part.trim();
            // Remove quotes
            if (
              (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
              (trimmed.startsWith('"') && trimmed.endsWith('"'))
            ) {
              return trimmed.slice(1, -1);
            }
            return trimmed;
          });
          descriptionText = concatenatedParts.join('');
        }
        // Simple quoted string
        else if (
          (descriptionStr.startsWith("'") && descriptionStr.endsWith("'")) ||
          (descriptionStr.startsWith('"') && descriptionStr.endsWith('"'))
        ) {
          descriptionText = descriptionStr.slice(1, -1);
        }
      }

      // If all fails, try simpler pattern
      if (!descriptionText) {
        const simpleMatch = decoratorContent.match(
          /description:\s*['"]([^'"]+)['"]/
        );
        if (simpleMatch) {
          descriptionText = simpleMatch[1];
        }
      }

      // Process the description
      if (descriptionText) {
        // Clean concatenated strings in multiline descriptions
        descriptionText = descriptionText.replace(/['"`]\s*\+\s*['"`]/g, ' ');

        // Get just the first sentence for the README
        const firstSentence = descriptionText
          .split(/\.(?!\d)/)
          .filter(Boolean)[0];
        if (firstSentence) {
          descriptionText = firstSentence.trim() + '.';
        }

        // Truncate description if it's too long
        if (descriptionText.length > 100) {
          descriptionText = descriptionText.substring(0, 97) + '...';
        }
      }

      // Add this prompt to the results array
      results.push({
        id: idMatch[1],
        name: nameMatch[1],
        description: descriptionText,
        category: categoryMatch[1]
      });
    }

    return results.length > 0 ? results : null;
  } catch (error) {
    console.error(`Error extracting info from ${filePath}:`, error);
    return null;
  }
}

/**
 * Update both README.md files with available prompts
 */
async function updateReadmePromptsList(promptInfos) {
  const mainReadmePath = path.join(rootDir, 'README.md');
  const promptsReadmePath = path.join(rootDir, 'src', 'prompts', 'README.md');

  try {
    // Read the main README.md file to update the prompt count
    let mainReadmeContent = fs.readFileSync(mainReadmePath, 'utf8');
    // Organize prompts by category
    const promptsByCategory = {};
    let totalPromptCount = 0;

    for (const prompt of promptInfos) {
      if (!prompt) continue;

      if (!promptsByCategory[prompt.category]) {
        promptsByCategory[prompt.category] = [];
      }

      promptsByCategory[prompt.category].push(prompt);
      totalPromptCount++;
    }

    // Read the existing prompts README.md if it exists
    let promptsReadmeContent = '';
    try {
      promptsReadmeContent = fs.readFileSync(promptsReadmePath, 'utf8');
    } catch (error) {
      // If the file doesn't exist, create a basic structure with markers
      promptsReadmeContent = `# Available Prompts\n\n`;
      promptsReadmeContent += `MCP Tools provides a collection of prompt templates across multiple categories to enhance LLMs capabilities.\n\n`;

      promptsReadmeContent += `## Prompt Categories\n\n`;
      promptsReadmeContent += `<!-- BEGIN PROMPT CATEGORIES -->\n<!-- END PROMPT CATEGORIES -->\n\n`;

      promptsReadmeContent += `## Prompt List\n\n`;
      promptsReadmeContent += `<!-- BEGIN PROMPT LIST -->\n<!-- END PROMPT LIST -->\n`;
    }

    // Sort categories alphabetically
    const sortedCategories = Object.keys(promptsByCategory).sort();

    // Generate categories content
    let categoriesContent = `The prompts are organized into the following categories:\n\n`;

    for (const category of sortedCategories) {
      categoriesContent += `- **${category}** - Prompts for ${category.toLowerCase()} related operations\n`;
    }

    // Update the categories section using markers
    const categoriesMarkerStart = '<!-- BEGIN PROMPT CATEGORIES -->';
    const categoriesMarkerEnd = '<!-- END PROMPT CATEGORIES -->';

    promptsReadmeContent = updateContentBetweenMarkers(
      promptsReadmeContent,
      categoriesMarkerStart,
      categoriesMarkerEnd,
      categoriesContent
    );

    if (promptsReadmeContent.indexOf(categoriesMarkerStart) === -1) {
      console.log('WARNING: Prompt categories markers not found in README.');
    }

    // Generate prompts list content
    let promptsListContent = '| Prompt Name | Category | Description |\n';
    promptsListContent += '|-------------|----------|-------------|\n';

    // Add all prompts to the table, grouped by category
    for (const category of sortedCategories) {
      // Sort prompts within each category by name
      const sortedPrompts = promptsByCategory[category].sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      for (const prompt of sortedPrompts) {
        // Format the description properly
        let description = '';
        if (prompt.description) {
          description = prompt.description;

          // Make sure description ends with a period if it doesn't already
          if (
            !description.endsWith('.') &&
            !description.endsWith('!') &&
            !description.endsWith('?')
          ) {
            description += '.';
          }
        }

        // Add to table
        promptsListContent += `| \`${prompt.name}\` | ${category} | ${description || 'No description available.'} |\n`;
      }
    }

    // Update the prompts list section using markers
    const promptsListMarkerStart = '<!-- BEGIN PROMPT LIST -->';
    const promptsListMarkerEnd = '<!-- END PROMPT LIST -->';

    promptsReadmeContent = updateContentBetweenMarkers(
      promptsReadmeContent,
      promptsListMarkerStart,
      promptsListMarkerEnd,
      promptsListContent
    );

    if (promptsReadmeContent.indexOf(promptsListMarkerStart) === -1) {
      console.log('WARNING: Prompt list markers not found in README.');
    }

    fs.writeFileSync(promptsReadmePath, promptsReadmeContent);
    console.log('Updated prompts README.md');

    // Update the main README.md with a reference to the prompts
    const promptCount = promptInfos.length;
    const categoryCount = sortedCategories.length;

    // Create the prompt stats content
    const promptStats = `MCP Tools provides ${promptCount} prompts across ${categoryCount} categories to enhance your agent's capabilities.`;

    // Define marker comments
    const startMarker = '<!-- BEGIN PROMPT STATS -->';
    const endMarker = '<!-- END PROMPT STATS -->';

    // Try to update content between markers if they exist
    const updatedContent = updateContentBetweenMarkers(
      mainReadmeContent,
      startMarker,
      endMarker,
      promptStats
    );

    mainReadmeContent = updatedContent;

    fs.writeFileSync(mainReadmePath, mainReadmeContent);
    console.log('Updated prompt reference in main README.md');
  } catch (error) {
    console.error('Error updating README files:', error);
  }
}

/**
 * Main function to generate the loader file
 */
async function generateLoader() {
  console.log('Generating prompt loader file...');

  // Find all potential prompt files
  const allPromptFiles = findPromptFiles(promptsDir);

  // Filter to only include files with @Prompt decorator
  const promptFiles = [];
  const promptInfos = [];

  for (const file of allPromptFiles) {
    const fullPath = path.join(promptsDir, file);
    if (hasPromptDecorator(fullPath)) {
      promptFiles.push(file);

      // Extract prompt information for logging
      const extractedPrompts = extractPromptInfo(fullPath);
      if (extractedPrompts) {
        // Handle the new array return type from extractPromptInfo
        if (Array.isArray(extractedPrompts)) {
          promptInfos.push(...extractedPrompts);
        } else {
          // For backward compatibility in case it returns a single object
          promptInfos.push(extractedPrompts);
        }
      }
    }
  }

  // Generate the loader file content
  const importStatements = generateImports(promptFiles);
  const loaderContent = `/**
 * Prompt loader - AUTO-GENERATED FILE
 *
 * This file is automatically generated by scripts/generate-prompt-loader.js
 * Do not edit this file directly - your changes will be overwritten.
 *
 * All prompt implementations that use the @Prompt decorator are automatically imported here.
 */

// Auto-generated imports
${importStatements}

// No need to export anything - the imports themselves will register the prompts
`;

  // Write the loader file
  fs.writeFileSync(outputFile, loaderContent);
  console.log(`Generated loader file at: ${outputFile}`);

  // Update the README.md file with the available prompts
  // EC: Disabled in favor of mkdocs generation
  //   await updateReadmePromptsList(promptInfos);
}

// Run the script
generateLoader();
