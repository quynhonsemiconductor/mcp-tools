import chalk from 'chalk';
import { table } from 'table';
import { resourceRegistry } from '../registry/resources';
import { notifyIfUpdateAvailable } from '../utils/update-utils';

/**
 * Display a list of all available resources
 */
export async function listResources(): Promise<void> {
  const asJson = process.argv.includes('--json');
  const filtered = process.argv.includes('--filtered');
  // Initialize the registry
  await resourceRegistry.initialize();

  if (asJson) {
    const resources = resourceRegistry.getAllResources(filtered);
    console.log(JSON.stringify(resources, null, 2));
    return;
  }

  // Get all categories
  const categories = resourceRegistry.getCategories(filtered);

  if (categories.length === 0) {
    console.log('No resources found. Try running: bun run new:resource');
    return;
  }

  console.log(`\n${chalk.bold('Resources')}\n`);

  let totalResources = 0;
  // Display resources grouped by category
  categories.forEach((category) => {
    const resources = resourceRegistry.getResourcesByCategory(category);

    // Skip empty categories
    if (resources.length === 0) return;

    console.log(chalk.cyan(`\n## ${category}`));

    // Prepare table data
    const data = [[chalk.bold('ID'), chalk.bold('Name'), chalk.bold('Description')]];
    totalResources += resources.length;
    resources.forEach((resource) => {
      data.push([
        resource.id,
        resource.name,
        // Trim description if it's too long
        resource.description.length > 60
          ? `${resource.description.slice(0, 57)}...`
          : resource.description,
      ]);
    });

    // Print table
    console.log(table(data));
  });

  console.log(
    `\nTotal: ${chalk.bold(totalResources)} resources in ${categories.length} categories`,
  );

  // Run a silent update check at the end
  try {
    await notifyIfUpdateAvailable();
  } catch {
    // Silently ignore any errors from the update check
  }
}
