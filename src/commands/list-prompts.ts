import chalk from 'chalk';
import { displayError, displayHeader } from '../lib/display';
import { promptRegistry } from '../registry';
import { notifyIfUpdateAvailable } from '../utils/update-utils';
/**
 * List all registered prompts command
 */
export async function listPrompts(): Promise<void> {
  const asJson = process.argv.includes('--json');
  const filtered = process.argv.includes('--filtered');
  try {
    // Display header
    if (!asJson) {
      displayHeader();
    }

    // Initialize the registry to discover prompts
    await promptRegistry.initialize();

    const prompts = promptRegistry.getAllPrompts(filtered);
    if (asJson) {
      console.log(JSON.stringify(prompts, null, 2));
      return;
    }
    const sources = promptRegistry.getPromptSources();
    const categories = promptRegistry.getCategories();

    console.log(
      `📋 Available Prompts: ${prompts.length} prompts(s) from ${sources.length} sources in ${categories.length} categories\n`,
    );

    // Group by sourcePath and category
    const promptsBySourceAndCategory: Record<string, Record<string, typeof prompts>> = {};

    // Group prompts by source path and category
    prompts.forEach((prompt) => {
      const sourcePath = prompt.sourcePath || 'qnsc-mcp';
      const category = prompt.category;

      if (!promptsBySourceAndCategory[sourcePath]) {
        promptsBySourceAndCategory[sourcePath] = {};
      }

      if (!promptsBySourceAndCategory[sourcePath][category]) {
        promptsBySourceAndCategory[sourcePath][category] = [];
      }

      promptsBySourceAndCategory[sourcePath][category].push(prompt);
    });

    // Sort sources with qnsc-mcp first, then alphabetically
    const sortedSources = Object.keys(promptsBySourceAndCategory).sort((a, b) => {
      if (a === 'qnsc-mcp' && b !== 'qnsc-mcp') return -1;
      if (a !== 'qnsc-mcp' && b === 'qnsc-mcp') return 1;
      return a.localeCompare(b);
    });

    // Display prompts grouped by source and category
    sortedSources.forEach((sourcePath, _sourceIndex) => {
      const sourcePrompts = promptsBySourceAndCategory[sourcePath];
      const sourceCategories = Object.keys(sourcePrompts);
      const totalPromptsInSource = sourceCategories.reduce(
        (total, cat) => total + sourcePrompts[cat].length,
        0,
      );

      // Display source header
      console.log(`\n\x1b[1m\x1b[35m📦 ${sourcePath} (${totalPromptsInSource} prompts)\x1b[0m`); // Bold magenta color
      console.log('\x1b[35m' + '═'.repeat(sourcePath.length + 15) + '\x1b[0m'); // Magenta separator

      // Sort categories alphabetically within each source
      const sortedCategories = sourceCategories.sort((a, b) => a.localeCompare(b));

      sortedCategories.forEach((category) => {
        const categoryPrompts = sourcePrompts[category];

        console.log(`\n  \x1b[1m\x1b[36m${category} (${categoryPrompts.length})\x1b[0m`); // Bold cyan color, indented
        console.log('  \x1b[36m' + '─'.repeat(category.length + 4) + '\x1b[0m'); // Cyan separator, indented

        // Display each prompt in the category
        categoryPrompts
          .sort((a, b) => a.name.localeCompare(b.name)) // Sort alphabetically
          .forEach((prompt) => {
            // Display original ID for external prompts, or regular ID for built-in prompts
            const displayId = prompt.originalId || prompt.id;
            console.log(`  • ${chalk.bold(prompt.name)} (id: ${displayId})`); // Indented
            console.log(`    ${prompt.description}`); // Indented more
          });
      });
    });

    console.log('\n');

    // Run a silent update check at the end
    try {
      await notifyIfUpdateAvailable();
    } catch {
      // Silently ignore any errors from the update check
    }
  } catch (error) {
    displayError('Error listing prompts', error);
    process.exit(1);
  }
}
