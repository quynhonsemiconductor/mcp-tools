import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import chalk from 'chalk';

import { setupStandardMocks } from '../test-utils/mocks';

// Mock update-utils
const mockNotifyIfUpdateAvailable = mock(() => Promise.resolve());
void mock.module('../utils/update-utils', () => ({
  notifyIfUpdateAvailable: mockNotifyIfUpdateAvailable,
}));
const { mockLoadConfig, mockDisplay, mockResourceRegistry } = setupStandardMocks();
const {
  displayHeader: mockDisplayHeader,
  displayError: mockDisplayError,
  bold: mockBold,
  dim: mockDim,
} = mockDisplay;
const {
  initialize: mockInitialize,
  getAllResources: mockGetAllResources,
  getCategories: mockGetCategories,
  getResourcesByCategory: mockGetResourcesByCategory,
  getResourceCount: _mockGetResourceCount,
} = mockResourceRegistry;

import { ResourceConfig } from '../registry/resources/types';
import { listResources } from './list-resources';

// Import after mocking
const { resourceRegistry } = await import('../registry/resources');

describe('listResources', () => {
  // Mock console.log to capture output
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let processExitSpy: ReturnType<typeof spyOn>;

  const originalProcessArgv = process.argv;

  // Sample data for testing
  const mockResources = [
    {
      id: 'resource1',
      name: 'Alpha Resource',
      description: 'Description for resource 1',
      category: 'category1',
      arguments: [],
    },
    {
      id: 'resource2',
      name: 'Beta Resource',
      description: 'Description for resource 2',
      category: 'category1',
      arguments: [],
    },
    {
      id: 'resource3',
      name: 'Gamma Resource',
      description: 'Description for resource 3',
      category: 'category2',
      arguments: [],
    },
    {
      id: 'resource4',
      name: 'Delta Resource',
      description: 'Description for resource 4',
      category: 'category2',
      arguments: [],
    },
    {
      id: 'resource5',
      name: 'Epsilon Resource',
      description: 'Description for resource 5',
      category: 'category3',
      arguments: [],
    },
  ];

  const mockCategories = ['category1', 'category2', 'category3'];

  beforeEach(() => {
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});

    // Mock process.exit
    processExitSpy = spyOn(process, 'exit').mockImplementation((() => undefined) as any);

    // Reset process.argv
    process.argv = [...originalProcessArgv];

    // Reset all mocks
    mockLoadConfig.mockClear();
    mockDisplayHeader.mockClear();
    mockDisplayError.mockClear();
    mockBold.mockClear().mockImplementation((text) => `<bold>${text}</bold>`);
    mockDim.mockClear().mockImplementation((text) => `<dim>${text}</dim>`);
    mockInitialize.mockClear().mockImplementation(() => Promise.resolve());
    mockGetAllResources.mockClear().mockImplementation(() => mockResources);
    mockGetCategories.mockClear().mockImplementation(() => mockCategories);
    mockGetResourcesByCategory.mockClear().mockImplementation((category) => {
      return mockResources.filter((resource) => resource.category === category);
    });
    mockNotifyIfUpdateAvailable.mockClear().mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    processExitSpy.mockRestore();
    consoleLogSpy.mockRestore();
    process.argv = originalProcessArgv;
  });

  it('should display a message when no resources are found', async () => {
    // Mock getCategories to return empty array
    (resourceRegistry.getCategories as any).mockReturnValue([]);

    await listResources();

    expect(resourceRegistry.initialize).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No resources found'));
  });

  it('should display resources grouped by category', async () => {
    const mockCategories = ['Documentation', 'Code'];
    const mockResources: Record<string, ResourceConfig[]> = {
      Documentation: [
        {
          id: 'doc-resource',
          name: 'Documentation Resource',
          description: 'A documentation resource',
          category: 'Documentation',
          arguments: [],
        },
      ],
      Code: [
        {
          id: 'code-resource',
          name: 'Code Resource',
          description: 'A code resource',
          category: 'Code',
          arguments: [],
        },
      ],
    };

    // Mock getCategories to return categories
    (resourceRegistry.getCategories as any).mockReturnValue(mockCategories);

    // Mock getResourcesByCategory to return resources based on category
    (resourceRegistry.getResourcesByCategory as any).mockImplementation(
      (category: string) => mockResources[category] || [],
    );

    // Mock resource count
    (resourceRegistry.getResourceCount as any).mockReturnValue(2);

    await listResources();

    expect(resourceRegistry.initialize).toHaveBeenCalled();
    expect(resourceRegistry.getCategories).toHaveBeenCalled();

    // Check that we displayed the categories
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Documentation'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Code'));

    // Check that we displayed the total
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Total: ${chalk.bold(2)} resources`),
    );
  });
});
