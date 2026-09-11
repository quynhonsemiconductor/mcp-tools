#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const resourcesDir = path.join(rootDir, 'src', 'resources');
const outputFile = path.join(rootDir, 'src', 'registry', 'resources-loader.ts');

/**
 * Find all resource files in the resources directory
 * This includes files that likely contain resource definitions
 */
function findResourceFiles(dir, resourceFiles = []) {
  if (!fs.existsSync(dir)) {
    return resourceFiles;
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
      findResourceFiles(entryPath, resourceFiles);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('Resource.ts') ||
        entry.name.endsWith('Resource.js') ||
        entry.name.endsWith('-resource.ts') ||
        entry.name.endsWith('-resource.js') ||
        entry.name === 'index.ts' ||
        entry.name === 'index.js')
    ) {
      // Found a potential resource file
      const relativePath = path.relative(resourcesDir, entryPath);
      resourceFiles.push(relativePath);
    }
  }

  return resourceFiles;
}

/**
 * Generate import statements for each resource file
 */
function generateImports(resourceFiles) {
  return resourceFiles
    .map((file) => {
      // Convert from absolute path to relative import path
      let importPath = '../resources/' + file.replace(/\\/g, '/');
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
 * Check if a file contains the @Resource decorator
 */
function hasResourceDecorator(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    // Check for @Resource( pattern which indicates the decorator
    return content.includes('@Resource(');
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return false;
  }
}

/**
 * Extract resource information by parsing the content of a resource file
 * Now processes multiple @Resource decorators in a single file
 */
function extractResourceInfo(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const results = [];

    // Extract information from all Resource decorators using global flag
    const decoratorRegex = /@Resource\({([\s\S]*?)\}\)/gs;
    let match;

    // Find all instances of @Resource decorators in the file
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
      let descriptionMatch = decoratorContent.match(
        /description:\s*((?:`(?:[^`]+)`|['"](?:[^'"]+)['"](?:\s*\+\s*['"](?:[^'"]+)['"])*)\s*,)/s
      );

      let descriptionText = '';

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

      // Add this resource to the results array
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
 * Update both README.md files with available resources
 */
async function updateReadmeResourcesList(resourceInfos) {
  const mainReadmePath = path.join(rootDir, 'README.md');
  const resourcesReadmePath = path.join(
    rootDir,
    'src',
    'resources',
    'README.md'
  );

  try {
    // Read the main README.md file to update the resource count
    let mainReadmeContent = fs.readFileSync(mainReadmePath, 'utf8');
    // Organize resources by category
    const resourcesByCategory = {};
    let totalResourceCount = 0;

    for (const resource of resourceInfos) {
      if (!resource) continue;

      if (!resourcesByCategory[resource.category]) {
        resourcesByCategory[resource.category] = [];
      }

      resourcesByCategory[resource.category].push(resource);
      totalResourceCount++;
    }

    // Read the existing resources README.md if it exists
    let resourcesReadmeContent = '';
    try {
      resourcesReadmeContent = fs.readFileSync(resourcesReadmePath, 'utf8');
    } catch (error) {
      // If the file doesn't exist, create a basic structure with markers
      resourcesReadmeContent = `# Available Resources\n\n`;
      resourcesReadmeContent += `MCP Tools provides a collection of resources across multiple categories.\n\n`;

      resourcesReadmeContent += `## Resource Categories\n\n`;
      resourcesReadmeContent += `<!-- BEGIN RESOURCE CATEGORIES -->\n<!-- END RESOURCE CATEGORIES -->\n\n`;

      resourcesReadmeContent += `## Resource List\n\n`;
      resourcesReadmeContent += `<!-- BEGIN RESOURCE LIST -->\n<!-- END RESOURCE LIST -->\n`;
    }

    // Sort categories alphabetically
    const sortedCategories = Object.keys(resourcesByCategory).sort();

    // Generate categories content
    let categoriesContent = `The resources are organized into the following categories:\n\n`;

    for (const category of sortedCategories) {
      categoriesContent += `- **${category}** - Resources for ${category.toLowerCase()} related operations\n`;
    }

    // Update the categories section using markers
    const categoriesMarkerStart = '<!-- BEGIN RESOURCE CATEGORIES -->';
    const categoriesMarkerEnd = '<!-- END RESOURCE CATEGORIES -->';

    resourcesReadmeContent = updateContentBetweenMarkers(
      resourcesReadmeContent,
      categoriesMarkerStart,
      categoriesMarkerEnd,
      categoriesContent
    );

    if (resourcesReadmeContent.indexOf(categoriesMarkerStart) === -1) {
      console.log('WARNING: Resource categories markers not found in README.');
    }

    // Generate resources list content
    let resourcesListContent = '| Resource Name | Category | Description |\n';
    resourcesListContent += '|---------------|----------|-------------|\n';

    // Add all resources to the table, grouped by category
    for (const category of sortedCategories) {
      // Sort resources within each category by name
      const sortedResources = resourcesByCategory[category].sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      for (const resource of sortedResources) {
        // Format the description properly
        let description = '';
        if (resource.description) {
          description = resource.description;

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
        resourcesListContent += `| \`${resource.name}\` | ${category} | ${description || 'No description available.'} |\n`;
      }
    }

    // Update the resources list section using markers
    const resourcesListMarkerStart = '<!-- BEGIN RESOURCE LIST -->';
    const resourcesListMarkerEnd = '<!-- END RESOURCE LIST -->';

    resourcesReadmeContent = updateContentBetweenMarkers(
      resourcesReadmeContent,
      resourcesListMarkerStart,
      resourcesListMarkerEnd,
      resourcesListContent
    );

    if (resourcesReadmeContent.indexOf(resourcesListMarkerStart) === -1) {
      console.log('WARNING: Resource list markers not found in README.');
    }

    fs.writeFileSync(resourcesReadmePath, resourcesReadmeContent);
    console.log('Updated resources README.md');

    // Update the main README.md with a reference to the resources
    const resourceCount = resourceInfos.length;
    const categoryCount = sortedCategories.length;

    // Create the resource stats content
    const resourceStats = `MCP Tools provides ${resourceCount} resources across ${categoryCount} categories.`;

    // Define marker comments
    const startMarker = '<!-- BEGIN RESOURCE STATS -->';
    const endMarker = '<!-- END RESOURCE STATS -->';

    // Try to update content between markers if they exist
    const updatedContent = updateContentBetweenMarkers(
      mainReadmeContent,
      startMarker,
      endMarker,
      resourceStats
    );

    mainReadmeContent = updatedContent;

    fs.writeFileSync(mainReadmePath, mainReadmeContent);
    console.log('Updated resource reference in main README.md');
  } catch (error) {
    console.error('Error updating README files:', error);
  }
}

/**
 * Main function to generate the loader file
 */
async function generateLoader() {
  console.log('Generating resource loader file...');

  if (!fs.existsSync(resourcesDir)) {
    console.log(
      `Resources directory (${resourcesDir}) does not exist yet. Creating it...`
    );
    fs.mkdirSync(resourcesDir, { recursive: true });
  }

  // Find all potential resource files
  const allResourceFiles = findResourceFiles(resourcesDir);

  // Filter to only include files with @Resource decorator
  const resourceFiles = [];
  const resourceInfos = [];

  for (const file of allResourceFiles) {
    const fullPath = path.join(resourcesDir, file);
    if (hasResourceDecorator(fullPath)) {
      resourceFiles.push(file);

      // Extract resource information for logging
      const extractedResources = extractResourceInfo(fullPath);
      if (extractedResources) {
        // Handle the new array return type from extractResourceInfo
        if (Array.isArray(extractedResources)) {
          resourceInfos.push(...extractedResources);
        } else {
          // For backward compatibility in case it returns a single object
          resourceInfos.push(extractedResources);
        }
      }
    }
  }

  if (resourceFiles.length > 0) {
    console.log(
      `Found ${resourceFiles.length} resource files with @Resource decorator.`
    );
  }

  // Generate the loader file content
  const importStatements = generateImports(resourceFiles);
  const loaderContent = `/**
 * Resource loader - AUTO-GENERATED FILE
 *
 * This file is automatically generated by scripts/generate-resource-loader.js
 * Do not edit this file directly - your changes will be overwritten.
 *
 * All resource implementations that use the @Resource decorator are automatically imported here.
 */

// Auto-generated imports
${importStatements}

// No need to export anything - the imports themselves will register the resources
`;

  // Write the loader file
  fs.writeFileSync(outputFile, loaderContent);
  console.log(`Generated loader file at: ${outputFile}`);

  // Update the README.md file with the available resources
  // EC: Disabled in favor of mkdocs generation
  //   await updateReadmeResourcesList(resourceInfos);
}

// Run the script
generateLoader();
