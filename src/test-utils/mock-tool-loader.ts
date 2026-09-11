import '../tools/weather/index';

// Export mock versions of the category loading functions
export const categoryLoaders: Record<string, () => Promise<void>> = {};
export const availableCategories: string[] = [];

export async function loadToolsByCategories(
  _categories?: string[],
  _excludeCategories?: string[],
): Promise<void> {
  // No-op for tests - tools are loaded individually as needed
}

export async function loadAllTools(): Promise<void> {
  // No-op for tests
}
