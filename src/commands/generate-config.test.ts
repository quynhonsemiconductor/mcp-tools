import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { setupStandardMocks } from '../test-utils/mocks';
const { mockDisplay, mockFS, mockRegistry, mockPromptRegistry: _mockPromptRegistry } = setupStandardMocks();

import yaml from 'js-yaml';
import { z } from 'zod';
import { BundledMCPManager } from '../gateway/bundled-mcp-manager';
import { generateConfig } from './generate-config';

describe('Generate Config Command', () => {
  let processExitSpy: ReturnType<typeof spyOn>;
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let processCwdSpy: ReturnType<typeof spyOn>;
  let bundledMCPManagerInitializeSpy: ReturnType<typeof spyOn>;
  let bundledMCPManagerGetBundledMCPsSpy: ReturnType<typeof spyOn>;
  const originalProcessArgv = process.argv;
  const originalProcessEnv = { ...process.env };

  // Sample data for testing
  const mockTools = [
    { id: 'tool1', name: 'Tool 1', description: 'Description for tool 1' },
    { id: 'tool2', name: 'Tool 2', description: 'Description for tool 2' },
    { id: 'tool3', name: 'Tool 3', description: 'Description for tool 3' },
    { id: 'tool4', name: 'Tool 4', description: 'Description for tool 4' },
    { id: 'tool5', name: 'Tool 5', description: 'Description for tool 5' },
    { id: 'tool6', name: 'Tool 6', description: 'Description for tool 6' },
  ];

  const mockCategories = ['category1', 'category2', 'category3'];

  const mockBundledMcps = [
    {
      name: 'figma',
      version: '0.4.3',
      tools: [{ id: 'tool1' }, { id: 'tool2' }],
    },
    { name: 'confluence', version: '1.31.2', tools: [{ id: 'tool3' }] },
    { name: 'slack', version: '0.0.0-dev', tools: [] },
  ];

  beforeEach(() => {
    // Mock console.log
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});

    // Mock process.exit
    processExitSpy = spyOn(process, 'exit').mockImplementation((() => undefined) as any);

    // Store original process.argv and mock cwd
    process.argv = [...originalProcessArgv];
    processCwdSpy = spyOn(process, 'cwd').mockImplementation(() => '/mock/cwd');

    // Mock environment variables
    process.env = { ...originalProcessEnv, HOME: '/mock/home' };

    // Reset and setup mocks
    mockRegistry.initialize.mockClear().mockImplementation(() => Promise.resolve());
    mockRegistry.getAllTools.mockClear().mockImplementation(() => mockTools as any);
    mockRegistry.getCategories.mockClear().mockImplementation(() => mockCategories as any);

    // Mock BundledMCPManager methods
    bundledMCPManagerInitializeSpy = spyOn(
      BundledMCPManager.prototype,
      'initialize',
    ).mockImplementation(() => Promise.resolve());
    bundledMCPManagerGetBundledMCPsSpy = spyOn(
      BundledMCPManager.prototype,
      'getBundledMCPs',
    ).mockImplementation(() => mockBundledMcps as any);

    // mockPath.resolve.mockClear().mockImplementation((p) => `/resolved/${p}`);
    // mockPath.join.mockClear().mockImplementation((...parts) => parts.join('/'));

    mockFS.existsSync.mockClear().mockImplementation(() => false);
    mockFS.writeFileSync.mockClear().mockImplementation(() => {});
    mockFS.mkdirSync.mockClear().mockImplementation(() => {});

    mockDisplay.displayHeader.mockClear().mockImplementation(() => {});
    mockDisplay.displayError.mockClear().mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    processCwdSpy.mockRestore();
    bundledMCPManagerInitializeSpy.mockRestore();
    bundledMCPManagerGetBundledMCPsSpy.mockRestore();
    process.argv = originalProcessArgv;
    process.env = { ...originalProcessEnv };
  });

  // describe('Config File Generation', () => {
  //   it('should generate config file at default location when no path is provided', async () => {
  //     await generateConfig();

  //     expect(mockRegistry.initialize).toHaveBeenCalled();
  //     expect(mockRegistry.getAllTools).toHaveBeenCalled();
  //     expect(mockRegistry.getCategories).toHaveBeenCalled();

  //     // Should create directory if it doesn't exist
  //     expect(mockPath.join).toHaveBeenCalledWith('/mock/home', '.qnscmcp');
  //     expect(mockFS.mkdirSync).toHaveBeenCalledWith('/mock/home/.qnscmcp', {
  //       recursive: true
  //     });

  //     // Should write to the correct file
  //     expect(mockPath.join).toHaveBeenCalledWith(
  //       '/mock/home/.qnscmcp',
  //       'config.yaml'
  //     );
  //     expect(mockFS.writeFileSync).toHaveBeenCalledWith(
  //       '/mock/home/.qnscmcp/config.yaml',
  //       expect.any(String),
  //       'utf8'
  //     );

  //     expect(consoleLogSpy).toHaveBeenCalledWith(
  //       expect.stringContaining(
  //         'Created configuration file at: /mock/home/.qnscmcp/config.yaml'
  //       )
  //     );
  //   });

  //   it('should generate config file at specified location when path is provided', async () => {
  //     const customPath = 'custom/config/path.yaml';

  //     await generateConfig(customPath);

  //     expect(mockPath.resolve).toHaveBeenCalledWith(customPath);
  //     expect(mockFS.writeFileSync).toHaveBeenCalledWith(
  //       '/resolved/custom/config/path.yaml',
  //       expect.any(String),
  //       'utf8'
  //     );

  //     expect(consoleLogSpy).toHaveBeenCalledWith(
  //       expect.stringContaining(
  //         'Created configuration file at: /resolved/custom/config/path.yaml'
  //       )
  //     );
  //   });

  //   it('should include details about available tools and categories in the generated config', async () => {
  //     let capturedContent = '';
  //     mockFS.writeFileSync.mockImplementation((_, content) => {
  //       capturedContent = content as string;
  //     });

  //     await generateConfig();

  //     // Check that the content includes tools
  //     mockTools.forEach((tool) => {
  //       expect(capturedContent).toContain(tool.id);
  //       expect(capturedContent).toContain(tool.name);
  //       expect(capturedContent).toContain(tool.description);
  //     });

  //     // Check that the content includes categories
  //     mockCategories.forEach((category) => {
  //       expect(capturedContent).toContain(category);
  //     });

  //     // Check that the content includes the expected sections
  //     expect(capturedContent).toContain('# Only include these specific tools');
  //     expect(capturedContent).toContain('# Exclude these specific tools');
  //     expect(capturedContent).toContain(
  //       '# Only include tools in these categories'
  //     );
  //     expect(capturedContent).toContain(
  //       '# Exclude all tools in these categories'
  //     );
  //     expect(capturedContent).toContain('# AVAILABLE CATEGORIES:');
  //     expect(capturedContent).toContain('# AVAILABLE TOOLS:');
  //   });
  // });

  // describe('Existing File Handling', () => {
  //   it('should not overwrite existing file without force flag', async () => {
  //     mockFS.existsSync.mockImplementation(() => true);

  //     await generateConfig();

  //     expect(mockFS.writeFileSync).not.toHaveBeenCalled();
  //     expect(consoleLogSpy).toHaveBeenCalledWith(
  //       expect.stringContaining('Configuration file already exists')
  //     );
  //     expect(consoleLogSpy).toHaveBeenCalledWith(
  //       expect.stringContaining('To overwrite, use --force or -f flag')
  //     );
  //   });

  //   it('should overwrite existing file with --force flag', async () => {
  //     mockFS.existsSync.mockImplementation(() => true);
  //     process.argv = [...originalProcessArgv, '--force'];

  //     await generateConfig();

  //     expect(mockFS.writeFileSync).toHaveBeenCalled();
  //   });

  //   it('should overwrite existing file with -f flag', async () => {
  //     mockFS.existsSync.mockImplementation(() => true);
  //     process.argv = [...originalProcessArgv, '-f'];

  //     await generateConfig();

  //     expect(mockFS.writeFileSync).toHaveBeenCalled();
  //   });
  // });

  describe('Error Handling', () => {
    it('should handle registry initialization errors', async () => {
      const error = new Error('Registry initialization failed');
      mockRegistry.initialize.mockImplementation(() => Promise.reject(error));

      await generateConfig();

      expect(mockDisplay.displayError).toHaveBeenCalledWith(
        'Error generating configuration',
        error,
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    // it('should handle file system errors', async () => {
    //   const error = new Error('File write failed');
    //   mockFS.writeFileSync.mockImplementation(() => {
    //     throw error;
    //   });

    //   await generateConfig();

    //   expect(mockDisplay.displayError).toHaveBeenCalledWith(
    //     'Error generating configuration',
    //     error
    //   );
    //   expect(processExitSpy).toHaveBeenCalledWith(1);
    // });
  });

  describe('Config Validation', () => {
    it('should generate valid YAML that passes schema validation', async () => {
      let capturedContent = '';
      mockFS.writeFileSync.mockImplementation((_path: string, content: string | Buffer) => {
        capturedContent = content as string;
      });

      await generateConfig();

      // Parse the generated YAML
      const parsedConfig = yaml.load(capturedContent) as any;

      // Verify tools is an object, not null
      expect(parsedConfig).toHaveProperty('tools');
      expect(parsedConfig.tools).toBeDefined();
      expect(parsedConfig.tools).not.toBeNull();
      expect(typeof parsedConfig.tools).toBe('object');

      // Create a simplified schema matching the config schema
      const toolsSchema = z
        .object({
          include: z.array(z.string()).optional(),
          exclude: z.array(z.string()).optional(),
          includeCategories: z.array(z.string()).optional(),
          excludeCategories: z.array(z.string()).optional(),
          includeMCPs: z.array(z.string()).optional(),
        })
        .strict()
        .optional();

      // Validate that tools can be parsed by the schema
      const validationResult = toolsSchema.safeParse(parsedConfig.tools);
      expect(validationResult.success).toBe(true);
    });
  });

  describe('Bundled MCP Integration', () => {
    it('should initialize bundled MCP manager and include bundled MCPs', async () => {
      await generateConfig();
      expect(bundledMCPManagerInitializeSpy).toHaveBeenCalled();
      expect(bundledMCPManagerGetBundledMCPsSpy).toHaveBeenCalled();

      expect(mockFS.writeFileSync).toHaveBeenCalled();
    });

    it('should handle empty bundled MCPs list', async () => {
      bundledMCPManagerGetBundledMCPsSpy.mockImplementation(() => []);

      await generateConfig();

      expect(bundledMCPManagerInitializeSpy).toHaveBeenCalled();
      expect(bundledMCPManagerGetBundledMCPsSpy).toHaveBeenCalled();
      expect(mockFS.writeFileSync).toHaveBeenCalled();
    });

    it('should handle bundled MCP manager initialization errors', async () => {
      const error = new Error('Bundled MCP initialization failed');
      bundledMCPManagerInitializeSpy.mockImplementation(() => Promise.reject(error));

      await generateConfig();

      expect(mockDisplay.displayError).toHaveBeenCalledWith(
        'Error generating configuration',
        error,
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});
