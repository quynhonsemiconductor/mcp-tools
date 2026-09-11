import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { z } from 'zod';

import { setupStandardMocks } from '../test-utils/mocks';
const { mockLoadConfig, mockDisplay, mockRegistry, mockPromptRegistry: _mockPromptRegistry } = setupStandardMocks();
const {
  displayHeader: mockDisplayHeader,
  displayError: mockDisplayError,
  bold: mockBold,
  dim: mockDim,
} = mockDisplay;
const {
  initialize: mockInitialize,
  getAllTools: mockGetAllTools,
  getCategories: mockGetCategories,
  getToolsByCategory: mockGetToolsByCategory,
} = mockRegistry;

// Mock update-utils
const mockNotifyIfUpdateAvailable = mock(() => Promise.resolve());
void mock.module('../utils/update-utils', () => ({
  notifyIfUpdateAvailable: mockNotifyIfUpdateAvailable,
}));

// Mock MCP initializers to track calls for --native flag testing
const mockInitializeBundledMCPs = mock(() => Promise.resolve());
const mockInitializeRemoteMCPs = mock(() => Promise.resolve(null));
const mockInitializeLocalMCPs = mock(() => Promise.resolve(null));
void mock.module('./bundled-mcp', () => ({
  initializeBundledMCPs: mockInitializeBundledMCPs,
}));
void mock.module('./remote-mcp', () => ({
  initializeRemoteMCPs: mockInitializeRemoteMCPs,
}));
void mock.module('./local-mcp', () => ({
  initializeLocalMCPs: mockInitializeLocalMCPs,
}));

import { listTools } from './list-tools';

describe('List Tools Command', () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let processExitSpy: ReturnType<typeof spyOn>;
  const originalProcessArgv = process.argv;

  // Sample data for testing
  const mockSchema = z.object({
    testParam: z.string().describe('Test parameter'),
  });

  const mockTools = [
    {
      id: 'tool1',
      name: 'Alpha Tool',
      description: 'Description for tool 1',
      category: 'category1',
      parameters: mockSchema,
    },
    {
      id: 'tool2',
      name: 'Beta Tool',
      description: 'Description for tool 2',
      category: 'category1',
      version: '1.0.0',
      parameters: mockSchema,
    },
    {
      id: 'tool3',
      name: 'Gamma Tool',
      description: 'Description for tool 3',
      category: 'category2',
      parameters: mockSchema,
    },
    {
      id: 'tool4',
      name: 'Delta Tool',
      description: 'Description for tool 4',
      category: 'category2',
      parameters: mockSchema,
    },
    {
      id: 'tool5',
      name: 'Epsilon Tool',
      description: 'Description for tool 5',
      category: 'category3',
      parameters: mockSchema,
    },
  ];

  const mockCategories = ['category1', 'category2', 'category3'];

  beforeEach(() => {
    // Mock console.log
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});

    // Mock process.exit
    processExitSpy = spyOn(process, 'exit').mockImplementation((() => undefined) as any);

    // Reset process.argv
    process.argv = [...originalProcessArgv];

    // Reset all mocks
    mockLoadConfig.mockClear().mockImplementation(() => ({}));
    mockDisplayHeader.mockClear();
    mockDisplayError.mockClear();
    mockBold.mockClear().mockImplementation((text) => `<bold>${text}</bold>`);
    mockDim.mockClear().mockImplementation((text) => `<dim>${text}</dim>`);
    mockInitialize.mockClear().mockImplementation(() => Promise.resolve());
    mockGetAllTools.mockClear().mockImplementation(() => mockTools);
    mockGetCategories.mockClear().mockImplementation(() => mockCategories);
    mockGetToolsByCategory.mockClear().mockImplementation((category) => {
      return mockTools.filter((tool) => tool.category === category);
    });
    mockNotifyIfUpdateAvailable.mockClear().mockImplementation(() => Promise.resolve());
    mockInitializeBundledMCPs.mockClear().mockImplementation(() => Promise.resolve());
    mockInitializeRemoteMCPs.mockClear().mockImplementation(() => Promise.resolve(null));
    mockInitializeLocalMCPs.mockClear().mockImplementation(() => Promise.resolve(null));
  });

  afterEach(() => {
    // Restore all mocks
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    process.argv = originalProcessArgv;
  });

  describe('Listing Tools Without Filtering', () => {
    it('should display all tools when no filtering is applied', async () => {
      await listTools();

      // Verify registry methods were called
      expect(mockInitialize).toHaveBeenCalled();
      expect(mockGetAllTools).toHaveBeenCalledWith(false);
      expect(mockGetCategories).toHaveBeenCalledWith(false);

      // Verify tool count is displayed
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          `Available Tools: ${mockTools.length} tool(s) in ${mockCategories.length} categories`,
        ),
      );

      // Check that categories are displayed
      mockCategories.forEach((category) => {
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(category));
      });

      // Verify that tool details are displayed
      mockTools.forEach((tool) => {
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(tool.name));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(tool.description));
      });

      // Check for version display for tool with version

      // Verify help message is displayed
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('To see filtered tools only, use the --filtered flag'),
      );
    });
  });

  describe('Listing Tools With Filtering', () => {
    beforeEach(() => {
      // Add the --filtered flag to process.argv
      process.argv = [...originalProcessArgv, '--filtered'];

      // Mock filtered tools and categories
      const filteredTools = mockTools.slice(0, 3); // Only first 3 tools
      const filteredCategories = ['category1', 'category2']; // Only first 2 categories

      mockGetAllTools.mockImplementation((filtered: any) => {
        return filtered ? filteredTools : mockTools;
      });

      mockGetCategories.mockImplementation((filtered: any) => {
        return filtered ? filteredCategories : mockCategories;
      });
    });

    it('should display filtered tools when --filtered flag is provided', async () => {
      await listTools();

      // Verify registry methods were called with filtered=true
      expect(mockGetAllTools).toHaveBeenCalledWith(true);
      expect(mockGetCategories).toHaveBeenCalledWith(true);

      // Verify filtered indicator is shown
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Using configuration:'));
    });

    it('should show active configuration when --filtered flag is provided', async () => {
      // Mock config with filtering options
      mockLoadConfig.mockImplementation(() => ({
        tools: {
          include: ['tool1', 'tool2'],
          exclude: ['tool4'],
          includeCategories: ['category1'],
          excludeCategories: ['category3'],
        },
      }));

      await listTools();

      // Check that configuration details are displayed
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Active Configuration'));
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Including: tool1, tool2'),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Excluding: tool4'));
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Including Categories: category1'),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Excluding Categories: category3'),
      );
    });

    it('should handle partial configuration options correctly', async () => {
      // Mock config with only some filtering options
      mockLoadConfig.mockImplementation(() => ({
        tools: {
          includeCategories: ['category1'],
        },
      }));

      await listTools();

      // Check that only the provided configuration is displayed
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Including Categories: category1'),
      );
      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('Including: '));
      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('Excluding: '));
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Excluding Categories: '),
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle registry initialization errors', async () => {
      const error = new Error('Registry initialization failed');
      mockInitialize.mockImplementation(() => Promise.reject(error));

      await listTools();

      expect(mockDisplayError).toHaveBeenCalledWith('Error listing tools', error);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle other runtime errors', async () => {
      const error = new Error('Something went wrong');

      // Reset previous mocks and make sure initialize succeeds
      mockInitialize.mockImplementation(() => Promise.resolve());

      // Make getAllTools throw our specific error
      mockGetAllTools.mockImplementation(() => {
        throw error;
      });

      await listTools();

      expect(mockDisplayError).toHaveBeenCalledWith('Error listing tools', expect.any(Error));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('Tool Output Formatting', () => {
    it('should sort categories alphabetically', async () => {
      // Use a spy to track the order of category output
      const outputOrder: string[] = [];
      consoleLogSpy.mockImplementation((message: any) => {
        // Capture category names from the output
        if (typeof message === 'string' && message.includes('\x1b[1m\x1b[36m')) {
          // eslint-disable-next-line no-control-regex -- intentionally matches ANSI escape (\x1b) sequences
          const match = message.match(/\x1b\[1m\x1b\[36m(.*?) \(/);
          if (match && match[1]) {
            outputOrder.push(match[1]);
          }
        }
      });

      await listTools();

      // Check that categories are in alphabetical order
      expect(outputOrder).toEqual([...outputOrder].sort());
    });

    it('text mode does not leak json-only fields (id, provider) and shows every fixture tool', async () => {
      // No --json flag — drive the text-output path
      // Use the existing deterministic mockTools / mockCategories fixture.
      await listTools();

      // Capture all console.log output and join it into one big string.
      const output = (consoleLogSpy.mock.calls as any[])
        .flat()
        .filter((arg) => typeof arg === 'string')
        .join('\n');

      // Every fixture tool name should appear in the text output.
      mockTools.forEach((tool) => {
        expect(output).toContain(tool.name);
      });

      // Every fixture category should appear in the text output.
      mockCategories.forEach((category) => {
        expect(output).toContain(category);
      });

      // Text mode must NOT leak JSON-only structural fields like `"id":` /
      // `"provider":` (these are dumpToolJson-only). Use the quoted forms
      // because plain "id" / "provider" can appear in chalk-coded prose.
      expect(output).not.toContain('"id":');
      expect(output).not.toContain('"provider":');
    });
  });

  describe('JSON Output', () => {
    it('should output JSON format when --json flag is provided', async () => {
      // Add the --json flag to process.argv
      process.argv = [...originalProcessArgv, '--json'];

      await listTools();

      // Verify that JSON output was produced
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"tools"'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"totalCount"'));

      // Verify displayHeader was not called (since we're in JSON mode)
      expect(mockDisplayHeader).not.toHaveBeenCalled();
    });

    /**
     * Helper: run listTools() with --json, capture the JSON document written
     * to stdout via writeJsonOutput (which delegates to console.log), and
     * return the parsed object.
     */
    const runAndParseJsonOutput = async (): Promise<any> => {
      await listTools();
      const jsonCall = consoleLogSpy.mock.calls.find(
        (call: any[]) =>
          typeof call[0] === 'string' &&
          call[0].includes('"tools"') &&
          call[0].includes('"totalCount"'),
      );
      if (!jsonCall) {
        throw new Error('No JSON output was captured from console.log');
      }
      return JSON.parse(jsonCall[0] as string);
    };

    describe('id and provider fields', () => {
      beforeEach(() => {
        process.argv = [...originalProcessArgv, '--json'];
      });

      it('should emit a string id on every tool entry that matches the registry id', async () => {
        const parsed = await runAndParseJsonOutput();

        expect(parsed.tools).toHaveLength(mockTools.length);
        // Every entry must have a string id matching the source registry id
        parsed.tools.forEach((entry: any, i: number) => {
          expect(typeof entry.id).toBe('string');
          expect(entry.id).toBe(mockTools[i].id);
        });
      });

      it("should default provider to 'native' when the registry tool has no provider", async () => {
        // None of the standard mockTools set `provider`, so all should default to 'native'
        const parsed = await runAndParseJsonOutput();

        expect(parsed.tools).toHaveLength(mockTools.length);
        parsed.tools.forEach((entry: any) => {
          expect(entry.provider).toBe('native');
        });
      });

      it.each([['bundled' as const], ['remote' as const], ['local' as const]])(
        "should pass through a non-native provider verbatim (provider='%s')",
        async (providerValue) => {
          // Override the registry to return a single tool with the given provider
          const providedTool = {
            id: `tool-${providerValue}`,
            name: `${providerValue} Tool`,
            description: `Description for ${providerValue} tool`,
            category: 'providedCategory',
            parameters: mockSchema,
            provider: providerValue,
          };
          mockGetAllTools.mockImplementation(() => [providedTool]);
          mockGetCategories.mockImplementation(() => ['providedCategory']);
          mockGetToolsByCategory.mockImplementation(() => [providedTool]);

          const parsed = await runAndParseJsonOutput();

          expect(parsed.tools).toHaveLength(1);
          expect(parsed.tools[0].id).toBe(providedTool.id);
          expect(parsed.tools[0].provider).toBe(providerValue);
        },
      );
    });

    it('should output filtered JSON when both --json and --filtered flags are provided', async () => {
      // Add both flags to process.argv
      process.argv = [...originalProcessArgv, '--json', '--filtered'];

      // Mock filtered tools
      const filteredTools = mockTools.slice(0, 2);
      mockGetAllTools.mockImplementation((filtered) => {
        return filtered ? filteredTools : mockTools;
      });

      // Mock config with filtering options
      mockLoadConfig.mockImplementation(() => ({
        tools: {
          include: ['tool1', 'tool2'],
          excludeCategories: ['category3'],
        },
      }));

      await listTools();

      // Verify that filtered JSON output was produced
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"filterConfig"'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"include"'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"excludeCategories"'));

      // Verify getAllTools was called with filtered=true
      expect(mockGetAllTools).toHaveBeenCalledWith(true);
    });

    describe('flag scoping for id and provider fields', () => {
      it('--filtered --json emits id and provider on every entry of the filtered subset', async () => {
        process.argv = [...originalProcessArgv, '--filtered', '--json'];

        // Use a filtered subset of 2 tools, matching the existing filtered-mock
        // pattern from "Listing Tools With Filtering".
        const filteredTools = mockTools.slice(0, 2);
        mockGetAllTools.mockImplementation((filtered: any) => {
          return filtered ? filteredTools : mockTools;
        });

        const parsed = await runAndParseJsonOutput();

        // Filtered subset must be the only thing emitted
        expect(parsed.tools.length).toBe(2);
        expect(mockGetAllTools).toHaveBeenCalledWith(true);

        // Every entry must have a string id AND provider === 'native'
        // (mockTools have no provider field, so they default to 'native')
        parsed.tools.forEach((entry: any, i: number) => {
          expect(typeof entry.id).toBe('string');
          expect(entry.id).toBe(filteredTools[i].id);
          expect(entry.provider).toBe('native');
        });
      });

      it('--native --json returns same tool set as no-flag JSON with provider=native on every entry', async () => {
        // First run: --json only, capture the parsed output
        process.argv = [...originalProcessArgv, '--json'];
        const noFlagParsed = await runAndParseJsonOutput();

        // Reset spy call history but keep the mock implementations stable
        consoleLogSpy.mockClear();

        // Second run: --native --json
        process.argv = [...originalProcessArgv, '--native', '--json'];
        const nativeParsed = await runAndParseJsonOutput();

        // Same tool set (ids, in the same order — registry getAllTools returns
        // the same fixture, since --native only changes whether external MCPs
        // are initialized — the registry contents don't differ for our mock).
        expect(nativeParsed.tools.length).toBe(noFlagParsed.tools.length);
        nativeParsed.tools.forEach((entry: any, i: number) => {
          expect(entry.id).toBe(noFlagParsed.tools[i].id);
          expect(entry.provider).toBe('native');
        });
      });
    });
  });

  describe('Native Only Flag', () => {
    it('should skip external MCP initialization when --native flag is provided', async () => {
      process.argv = [...originalProcessArgv, '--native'];

      await listTools();

      expect(mockInitialize).toHaveBeenCalled();
      expect(mockInitializeBundledMCPs).not.toHaveBeenCalled();
      expect(mockInitializeRemoteMCPs).not.toHaveBeenCalled();
      expect(mockInitializeLocalMCPs).not.toHaveBeenCalled();
    });

    it('should initialize external MCPs when --native flag is not provided', async () => {
      await listTools();

      expect(mockInitialize).toHaveBeenCalled();
      expect(mockInitializeBundledMCPs).toHaveBeenCalled();
      expect(mockInitializeRemoteMCPs).toHaveBeenCalled();
      expect(mockInitializeLocalMCPs).toHaveBeenCalled();
    });

    it('should display Native Only label when --native flag is provided', async () => {
      process.argv = [...originalProcessArgv, '--native'];

      await listTools();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Native Only'));
    });

    it('should output JSON without external MCPs when --native and --json flags are provided', async () => {
      process.argv = [...originalProcessArgv, '--native', '--json'];

      await listTools();

      expect(mockInitializeBundledMCPs).not.toHaveBeenCalled();
      expect(mockInitializeRemoteMCPs).not.toHaveBeenCalled();
      expect(mockInitializeLocalMCPs).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"tools"'));
    });
  });

  /**
   * CLI ↔ HTTP parity for the `--json` output and `/api/tools` HTTP endpoint.
   *
   * Spec Task 1.5. Co-located inside list-tools.test.ts (not a separate
   * parity.test.ts file) because invoking `listTools()` from a fresh test
   * file shifts Bun's module-load order in a way that destabilises
   * `lib/display` mock bindings used by sibling test files
   * (list-prompts.test.ts, local-mcp.test.ts, list-resources.test.ts).
   * Sharing the existing mock setup here avoids that pollution.
   *
   * The CLI source is `src/commands/list-tools.ts` (`dumpToolJson`), which
   * emits ToolConfig-shaped entries with `id`, `name`, and
   * `provider ?? 'native'`.
   *
   * The HTTP source is `src/commands/webserver.ts` lines 132-140, which maps
   * UnifiedToolInfo entries to `{id, name, description, category, parameters,
   * envVars, provider}`. We reproduce the 7-line webserver `.map()` inline
   * against a fixture instead of spinning up UnifiedMcpService (per the
   * survey: that's overweight for this contract test).
   *
   * For native-tool parity we also route the same ToolConfig fixture through
   * `transformNativeTools()` (the production transformer the unified service
   * uses for native tools) and confirm CLI ↔ transformer agreement.
   */
  describe('CLI ↔ HTTP parity', () => {
    const { transformNativeTools } = require('../services/mcp-transformers');
    type UnifiedToolInfo = import('../services/mcp-models').UnifiedToolInfo;
    type ParityToolConfig = import('../registry/types').ToolConfig;

    // Reproduces webserver.ts:132-140 verbatim. If that map changes, this
    // must change too.
    const webserverMap = (tools: UnifiedToolInfo[]) =>
      tools.map((tool) => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        category: tool.category,
        parameters: tool.parameters,
        envVars: tool.envVars || [],
        provider: tool.provider,
      }));

    // Helper: drive listTools --json against a ToolConfig fixture and return
    // the parsed JSON document. Reuses the surrounding describe's
    // consoleLogSpy and process.argv resets.
    const runCliJson = async (fixture: ParityToolConfig[]): Promise<any> => {
      const cats = Array.from(new Set(fixture.map((t) => t.category as string)));
      mockGetAllTools.mockImplementation(() => fixture);
      mockGetCategories.mockImplementation(() => cats);
      mockGetToolsByCategory.mockImplementation((category: any) =>
        fixture.filter((t) => t.category === category),
      );

      process.argv = [...originalProcessArgv, '--json'];
      await listTools();

      const jsonCall = consoleLogSpy.mock.calls.find(
        (call: any[]) =>
          typeof call[0] === 'string' &&
          call[0].includes('"tools"') &&
          call[0].includes('"totalCount"'),
      );
      if (!jsonCall) {
        throw new Error('No JSON output captured from listTools');
      }
      return JSON.parse(jsonCall[0] as string);
    };

    it('Case A: native-only fixture matches CLI ↔ transformNativeTools', async () => {
      // 4 native ToolConfig entries spanning 2 categories. No `provider` set
      // — they MUST default to 'native' through both pipelines.
      const nativeFixture: ParityToolConfig[] = [
        {
          id: 'native-alpha',
          name: 'AlphaTool',
          description: 'First native tool',
          category: 'Utility' as any,
          parameters: mockSchema,
        },
        {
          id: 'native-beta',
          name: 'BetaTool',
          description: 'Second native tool',
          category: 'Utility' as any,
          parameters: mockSchema,
        },
        {
          id: 'native-gamma',
          name: 'GammaTool',
          description: 'Third native tool',
          category: 'Web' as any,
          parameters: mockSchema,
        },
        {
          id: 'native-delta',
          name: 'DeltaTool',
          description: 'Fourth native tool',
          category: 'Web' as any,
          parameters: mockSchema,
        },
      ];

      // CLI side
      const cliParsed = await runCliJson(nativeFixture);
      expect(cliParsed.tools).toHaveLength(nativeFixture.length);

      // HTTP side: feed the same fixture through transformNativeTools(),
      // flatten the resulting UnifiedMCPInfo[].tools, run webserver map.
      const unifiedMcps = transformNativeTools(nativeFixture);
      const unifiedTools = unifiedMcps.flatMap((mcp: any) => mcp.tools);
      const httpEntries = webserverMap(unifiedTools);

      expect(httpEntries).toHaveLength(nativeFixture.length);

      // Index both sides by name (each tool has a unique name).
      const cliByName = new Map<string, any>(cliParsed.tools.map((t: any) => [t.name, t]));
      const httpByName = new Map<string, any>(httpEntries.map((t) => [t.name, t]));

      // Per-tool parity assertions.
      for (const fixtureTool of nativeFixture) {
        const cli = cliByName.get(fixtureTool.name);
        const http = httpByName.get(fixtureTool.name);

        expect(cli, `CLI missing tool ${fixtureTool.name}`).toBeDefined();
        expect(http, `HTTP missing tool ${fixtureTool.name}`).toBeDefined();

        expect(cli.id).toBe(http.id);
        expect(cli.id).toBe(fixtureTool.id);
        expect(cli.provider).toBe(http.provider);
        expect(cli.provider).toBe('native');
      }
    });

    it('Case B: mixed-provider fixture preserves provider field through both pipelines', async () => {
      // 1 native + 1 bundled + 1 remote + 1 local. The CLI emits all four;
      // the HTTP webserver map preserves the UnifiedToolInfo provider
      // verbatim (provider passthrough at webserver.ts:139).
      const mixedFixture: ParityToolConfig[] = [
        {
          id: 'native-only',
          name: 'NativeOnlyTool',
          description: 'A native tool',
          category: 'Utility' as any,
          parameters: mockSchema,
          // no provider — should default to 'native' through CLI
        },
        {
          id: 'bundled::someTool',
          name: 'BundledTool',
          description: 'A bundled tool',
          category: 'Bundled' as any,
          parameters: mockSchema,
          provider: 'bundled',
        },
        {
          id: 'remote-someServer-remoteThing',
          name: 'someServer__remoteThing',
          description: 'A remote tool',
          category: 'Remote' as any,
          parameters: mockSchema,
          provider: 'remote',
        },
        {
          id: 'local-someServer-localThing',
          name: 'someServer__localThing',
          description: 'A local tool',
          category: 'Local' as any,
          parameters: mockSchema,
          provider: 'local',
        },
      ];

      // CLI side: dumpToolJson emits one entry per ToolConfig, preserving
      // provider.
      const cliParsed = await runCliJson(mixedFixture);
      expect(cliParsed.tools).toHaveLength(mixedFixture.length);

      // Build an HTTP-side fixture as UnifiedToolInfo. The webserver passes
      // provider through verbatim, so per-tool parity on provider is the
      // contract under test.
      const unifiedFixture: UnifiedToolInfo[] = mixedFixture.map((t) => ({
        id: t.id,
        name: t.name,
        displayName: t.name,
        description: t.description,
        category: t.category as string,
        mcpId: 'fixture-mcp',
        mcpName: 'Fixture MCP',
        provider: (t.provider ?? 'native') as 'native' | 'bundled' | 'remote' | 'local',
        parameters: {},
        annotations: {},
      }));
      const httpEntries = webserverMap(unifiedFixture);

      const cliByName = new Map<string, any>(cliParsed.tools.map((t: any) => [t.name, t]));
      const httpByName = new Map<string, any>(httpEntries.map((t) => [t.name, t]));

      // Per-tool parity: id matches, provider matches, both sides resolve
      // missing-provider to 'native'.
      for (const fixtureTool of mixedFixture) {
        const cli = cliByName.get(fixtureTool.name);
        const http = httpByName.get(fixtureTool.name);
        const expectedProvider = fixtureTool.provider ?? 'native';

        expect(cli, `CLI missing tool ${fixtureTool.name}`).toBeDefined();
        expect(http, `HTTP missing tool ${fixtureTool.name}`).toBeDefined();

        expect(cli.id).toBe(fixtureTool.id);
        expect(http.id).toBe(fixtureTool.id);
        expect(cli.id).toBe(http.id);

        expect(cli.provider).toBe(expectedProvider);
        expect(http.provider).toBe(expectedProvider);
        expect(cli.provider).toBe(http.provider);
      }

      // Cross-check the native subset against transformNativeTools, which is
      // what the unified service actually uses for native tools. It must
      // filter to ONLY the native tool (1 entry) per the filter at
      // src/services/mcp-transformers.ts:420.
      const nativeUnifiedMcps = transformNativeTools(mixedFixture);
      const nativeUnifiedTools = nativeUnifiedMcps.flatMap((mcp: any) => mcp.tools);
      expect(nativeUnifiedTools).toHaveLength(1);
      expect(nativeUnifiedTools[0].id).toBe('native-only');
      expect(nativeUnifiedTools[0].provider).toBe('native');

      // And that single native entry must match the CLI's native entry.
      const cliNative = cliByName.get('NativeOnlyTool');
      expect(cliNative.id).toBe(nativeUnifiedTools[0].id);
      expect(cliNative.provider).toBe(nativeUnifiedTools[0].provider);
    });
  });

  describe('display name prefix stripping', () => {
    // Regression: the delimiter is '__', and a vendor's own tool name may contain
    // it. AWS Knowledge exposes `aws___read_documentation`, registered as
    // `aws-knowledge-mcp-server__aws___read_documentation`. Splitting on the
    // delimiter and taking index 1 rendered "aws" for all five of its tools.
    it('keeps a remote vendor tool name that itself contains the delimiter', async () => {
      const remoteTool = {
        id: 'remote-aws-knowledge-mcp-server__aws___read_documentation',
        name: 'aws-knowledge-mcp-server__aws___read_documentation',
        description: 'Fetch full AWS doc pages as markdown',
        category: 'Remote remote-aws-knowledge-mcp-server',
        parameters: mockSchema,
      };

      mockGetAllTools.mockImplementation(() => [remoteTool]);
      mockGetCategories.mockImplementation(() => [remoteTool.category]);
      mockGetToolsByCategory.mockImplementation(() => [remoteTool]);

      await listTools();

      const printed = consoleLogSpy.mock.calls.flat().join('\n');
      expect(printed).toContain('aws___read_documentation');
      // The server prefix must still be stripped.
      expect(printed).not.toContain('aws-knowledge-mcp-server__aws___read_documentation');
    });
  });
});
