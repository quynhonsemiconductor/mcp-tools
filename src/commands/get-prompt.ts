import { displayError, displayHeader } from '../lib/display';
import { promptRegistry } from '../registry';

/**
 * Get a specific prompt by ID
 */
export async function getPrompt(promptId: string): Promise<void> {
  try {
    // Display header
    displayHeader();

    // Initialize the registry to discover prompts
    await promptRegistry.initialize();

    const prompts = promptRegistry.getAllPrompts();
    const categories = promptRegistry.getCategories();

    console.log(
      `📋 Available Prompts: ${prompts.length} prompts(s) in ${categories.length} categories\n`,
    );

    const prompt = promptRegistry.getPromptById(promptId);
    if (!prompt) {
      console.log(`❌ Prompt with ID "${promptId}" not found.`);
      return;
    }

    // Display prompt details
    console.log(`\n\x1b[1m\x1b[36m[${promptId}] ${prompt.name}:\x1b[0m`); // Bold cyan color
    console.log(`  ${prompt.description}\n`);

    // Display required tools
    if (prompt.requiredTools && prompt.requiredTools.length > 0) {
      console.log(`\x1b[1m\x1b[33mRequired Tools:\x1b[0m`); // Bold yellow color
      prompt.requiredTools.forEach((tool) => {
        console.log(`  • ${tool}`);
      });
      console.log('');
    }

    // Display arguments
    const argumentEntries = Object.entries(prompt.arguments ?? {});
    if (argumentEntries.length > 0) {
      console.log(`\x1b[1m\x1b[33mArguments:\x1b[0m`); // Bold yellow color
      argumentEntries.forEach(([name, schema]) => {
        const isOptional =
          typeof (schema as { isOptional?: () => boolean }).isOptional === 'function'
            ? (schema as { isOptional: () => boolean }).isOptional()
            : false;
        const required = isOptional ? ' (optional)' : ' (required)';
        // For optional args, `.optional()` wraps the schema so the description lives
        // on the inner type; fall back to it when the outer description is absent.
        const withDef = schema as {
          description?: string;
          _def?: { innerType?: { description?: string } };
        };
        const description = withDef.description ?? withDef._def?.innerType?.description;
        console.log(`  • ${name}${required}: ${description || 'No description'}`);
      });
      console.log('');
    } else {
      console.log(`\x1b[1m\x1b[33mArguments:\x1b[0m None\n`);
    }

    // Get and display the prompt content
    console.log(`\x1b[1m\x1b[32mPrompt Template:\x1b[0m`); // Bold green color
    console.log('\x1b[32m' + '─'.repeat(80) + '\x1b[0m'); // Green separator

    try {
      // Get the prompt handler from the registry
      const registration = promptRegistry.getFromRegistry(promptId);
      if (registration) {
        const handler = new registration.handlerClass();

        // Create sample arguments for demonstration (all empty/default values)
        const sampleArgs: Record<string, any> = {};
        Object.keys(prompt.arguments ?? {}).forEach((name) => {
          sampleArgs[name] = `{{ ${name} }}`;
        });

        // Load the prompt template
        const promptContent = await handler.load(sampleArgs);
        console.log(promptContent);
      } else {
        console.log('❌ Could not load prompt content - handler not found');
      }
    } catch (error) {
      console.log(
        `❌ Could not load prompt content: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    console.log('\x1b[32m' + '─'.repeat(80) + '\x1b[0m'); // Green separator
  } catch (error) {
    displayError('Error getting prompt', error);
    process.exit(1);
  }
}
