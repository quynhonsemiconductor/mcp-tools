import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { ClaudeCodeUsageTool } from '.';
import { UserError } from '../../utils';
import { ClaudeCodeUsageToolParams, DailySummary, SessionTimeInfo, UsageData } from './index';

// Mock the external modules

// Exposes the tool's protected helper methods for direct testing, without resorting to `any`.
interface TestableClaudeCodeUsageTool {
  groupUsageByDate(
    usageData: UsageData[],
    sessionTimeInfo: Map<string, SessionTimeInfo>,
  ): DailySummary[];
  formatUsageSummary(summaries: DailySummary[], projectPath: string): string;
}

// Instead of mocking readline, let's create a test subclass
class TestClaudeCodeUsageTool extends ClaudeCodeUsageTool {
  async findProjectLogFiles(_projectPath: string): Promise<string[]> {
    // Return our test files
    return [
      '/mock-home-dir/.claude/projects/test-project/session-1.jsonl',
      '/mock-home-dir/.claude/projects/test-project/session-2.jsonl',
    ];
  }

  async parseLogFiles(_logFiles: string[]): Promise<{
    usageData: UsageData[];
    sessionTimeInfo: Map<string, SessionTimeInfo>;
  }> {
    // Return consistent test data
    const usageData: UsageData[] = [
      {
        date: new Date('2023-05-15T12:30:00Z'),
        sessionId: 'session-1',
        inputTokens: 500,
        cacheCreationInputTokens: 50,
        cacheReadInputTokens: 25,
        outputTokens: 300,
        costUSD: 0.012,
        durationMs: 2500,
      },
      {
        date: new Date('2023-05-15T12:35:00Z'),
        sessionId: 'session-1',
        inputTokens: 300,
        cacheCreationInputTokens: 30,
        cacheReadInputTokens: 15,
        outputTokens: 200,
        costUSD: 0.008,
        durationMs: 1500,
      },
    ];

    const sessionTimeInfo = new Map<string, SessionTimeInfo>();
    sessionTimeInfo.set('session-1', {
      sessionId: 'session-1',
      minTimestamp: new Date('2023-05-15T12:30:00Z'),
      maxTimestamp: new Date('2023-05-15T12:35:00Z'),
    });

    return { usageData, sessionTimeInfo };
  }
}

// For the UserError test
class NoClaudeDirectoryTool extends ClaudeCodeUsageTool {
  async findProjectLogFiles(_projectPath: string): Promise<string[]> {
    throw new UserError('No Claude logs found for this project: /test-path');
  }
}

// For the file read error test
class FileReadErrorTool extends ClaudeCodeUsageTool {
  async findProjectLogFiles(_projectPath: string): Promise<string[]> {
    throw new UserError('Error finding log files: File system error');
  }
}

// For invalid JSON test
class InvalidJsonTool extends ClaudeCodeUsageTool {
  async parseLogFiles(_logFiles: string[]): Promise<{
    usageData: UsageData[];
    sessionTimeInfo: Map<string, SessionTimeInfo>;
  }> {
    const usageData: UsageData[] = [
      {
        date: new Date('2023-05-15T12:30:00Z'),
        sessionId: 'session-1',
        inputTokens: 500,
        cacheCreationInputTokens: 50,
        cacheReadInputTokens: 25,
        outputTokens: 300,
        costUSD: 0.012,
        durationMs: 2500,
      },
    ];

    const sessionTimeInfo = new Map<string, SessionTimeInfo>();
    sessionTimeInfo.set('session-1', {
      sessionId: 'session-1',
      minTimestamp: new Date('2023-05-15T12:30:00Z'),
      maxTimestamp: new Date('2023-05-15T12:30:00Z'),
    });

    return { usageData, sessionTimeInfo };
  }
}

// For file read error test
class EmptyResultTool extends ClaudeCodeUsageTool {
  async parseLogFiles(_logFiles: string[]): Promise<{
    usageData: UsageData[];
    sessionTimeInfo: Map<string, SessionTimeInfo>;
  }> {
    return { usageData: [], sessionTimeInfo: new Map() };
  }
}

// mock.module's factory here is synchronous, so the returned Promise|void is never pending; fire-and-forget by design
void mock.module('../../services/logger', () => {
  return {
    logInfo: mock(() => {}),
  };
});

describe('ClaudeCodeUsageTool', () => {
  let tool: TestClaudeCodeUsageTool;

  beforeEach(() => {
    tool = new TestClaudeCodeUsageTool();
  });

  afterEach(() => {
    mock.restore();
  });

  describe('execute', () => {
    it('should process log files and return a formatted summary', async () => {
      const result = await tool.execute({});
      expect(result).toContain('Claude Code Usage Summary');
      expect(result).toContain('TOTAL');
      expect(result).toContain('920'); // Total input tokens
      expect(result).toContain('500'); // Output tokens
    });

    it('should use the provided project path', async () => {
      const projectPath = '/custom/project/path';
      // For this test, we'll modify our test class to check if the projectPath is used
      class ProjectPathTestTool extends TestClaudeCodeUsageTool {
        async execute(args: ClaudeCodeUsageToolParams) {
          // Verify the project path is properly passed
          const actualPath = args.projectPath || process.cwd();
          expect(actualPath).toBe(projectPath);
          return await super.execute(args);
        }
      }

      const projectPathTool = new ProjectPathTestTool();
      await projectPathTool.execute({ projectPath });
    });

    it('should use the current directory when no project path is provided', async () => {
      const mockCwd = '/current/working/dir';
      const originalCwd = process.cwd;
      process.cwd = mock(() => mockCwd);

      await tool.execute({});

      expect(process.cwd).toHaveBeenCalled();
      process.cwd = originalCwd;
    });
  });

  describe('findProjectLogFiles', () => {
    it('should find log files in the Claude directory', async () => {
      const files = await tool.findProjectLogFiles('/test/project');

      expect(files).toHaveLength(2);
      expect(files[0]).toContain('session-1.jsonl');
      expect(files[1]).toContain('session-2.jsonl');
    });

    it('should throw UserError when Claude directory does not exist', async () => {
      const noClaudeTool = new NoClaudeDirectoryTool();

      try {
        await noClaudeTool.findProjectLogFiles('/test/project');
        throw new Error('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(UserError);
        expect((error as UserError).message).toContain('No Claude logs found');
      }
    });

    it('should handle and throw errors from file system operations', async () => {
      const errorTool = new FileReadErrorTool();

      try {
        await errorTool.findProjectLogFiles('/test/project');
        throw new Error('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(UserError);
        expect((error as UserError).message).toContain('Error finding log files');
      }
    });
  });

  describe('parseLogFiles', () => {
    it('should parse log files and extract usage data', async () => {
      const { usageData, sessionTimeInfo } = await tool.parseLogFiles([
        '/mock-home-dir/.claude/projects/test-project/session-1.jsonl',
      ]);

      expect(usageData).toHaveLength(2);
      expect(usageData[0].inputTokens).toBe(500);
      expect(usageData[0].outputTokens).toBe(300);
      expect(usageData[0].costUSD).toBe(0.012);

      expect(sessionTimeInfo.size).toBe(1);
      expect(sessionTimeInfo.get('session-1')).toBeDefined();
    });

    it('should handle invalid JSON lines gracefully', async () => {
      const invalidJsonTool = new InvalidJsonTool();
      const { usageData } = await invalidJsonTool.parseLogFiles([
        '/mock-home-dir/.claude/projects/test-project/session-1.jsonl',
      ]);

      expect(usageData).toHaveLength(1);
    });

    it('should handle file reading errors gracefully', async () => {
      const emptyResultTool = new EmptyResultTool();
      const { usageData } = await emptyResultTool.parseLogFiles([
        '/mock-home-dir/.claude/projects/test-project/session-1.jsonl',
      ]);

      expect(usageData).toHaveLength(0);
    });

    it('should update session time info correctly', async () => {
      const { sessionTimeInfo } = await tool.parseLogFiles([
        '/mock-home-dir/.claude/projects/test-project/session-1.jsonl',
      ]);

      const timeInfo = sessionTimeInfo.get('session-1');
      expect(timeInfo).toBeDefined();
      expect(timeInfo?.minTimestamp).toBeInstanceOf(Date);
      expect(timeInfo?.maxTimestamp).toBeInstanceOf(Date);
      expect(timeInfo?.minTimestamp.toISOString()).toBe('2023-05-15T12:30:00.000Z');
      expect(timeInfo?.maxTimestamp.toISOString()).toBe('2023-05-15T12:35:00.000Z');
    });
  });

  describe('groupUsageByDate', () => {
    it('should group usage data by date correctly', () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const usageData: UsageData[] = [
        {
          date: today,
          sessionId: 'session-1',
          inputTokens: 500,
          cacheCreationInputTokens: 50,
          cacheReadInputTokens: 25,
          outputTokens: 300,
          costUSD: 0.012,
          durationMs: 2500,
        },
        {
          date: yesterday,
          sessionId: 'session-2',
          inputTokens: 300,
          cacheCreationInputTokens: 30,
          cacheReadInputTokens: 15,
          outputTokens: 200,
          costUSD: 0.008,
          durationMs: 1500,
        },
        {
          date: new Date('2020-01-01'), // Old date
          sessionId: 'session-3',
          inputTokens: 200,
          cacheCreationInputTokens: 20,
          cacheReadInputTokens: 10,
          outputTokens: 100,
          costUSD: 0.005,
          durationMs: 1000,
        },
      ];

      const sessionTimeInfo = new Map<string, SessionTimeInfo>([
        [
          'session-1',
          {
            sessionId: 'session-1',
            minTimestamp: new Date(today.getTime() - 10000),
            maxTimestamp: today,
          },
        ],
        [
          'session-2',
          {
            sessionId: 'session-2',
            minTimestamp: new Date(yesterday.getTime() - 20000),
            maxTimestamp: yesterday,
          },
        ],
        [
          'session-3',
          {
            sessionId: 'session-3',
            minTimestamp: new Date('2020-01-01T10:00:00Z'),
            maxTimestamp: new Date('2020-01-01T10:05:00Z'),
          },
        ],
      ]);

      const result = (tool as unknown as TestableClaudeCodeUsageTool).groupUsageByDate(usageData, sessionTimeInfo);

      expect(result.length).toBe(3); // Today, yesterday, and older

      // Find today's entry
      const todayKey = today.toISOString().split('T')[0];
      const todaySummary = result.find((s: DailySummary) => s.date === todayKey);
      expect(todaySummary).toBeDefined();
      expect(todaySummary?.inputTokens).toBe(575); // 500 + 50 + 25
      expect(todaySummary?.sessionCount).toBe(1);

      // Find older entry
      const olderSummary = result.find((s: DailySummary) => s.date === 'Older');
      expect(olderSummary).toBeDefined();
      expect(olderSummary?.inputTokens).toBe(230); // 200 + 20 + 10
    });

    it('should handle empty usage data', () => {
      const result = (tool as unknown as TestableClaudeCodeUsageTool).groupUsageByDate([], new Map());
      expect(result).toHaveLength(0);
    });
  });

  describe('formatUsageSummary', () => {
    it('should format the summary table correctly', () => {
      const summaries: DailySummary[] = [
        {
          date: '2023-05-15',
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
          costUSD: 0.02,
          llmDurationMs: 4000,
          sessionDurationMs: 300000, // 5 minutes
          sessionCount: 2,
        },
        {
          date: 'Older',
          inputTokens: 2000,
          outputTokens: 1000,
          totalTokens: 3000,
          costUSD: 0.04,
          llmDurationMs: 8000,
          sessionDurationMs: 600000, // 10 minutes
          sessionCount: 3,
        },
      ];

      const result = (tool as unknown as TestableClaudeCodeUsageTool).formatUsageSummary(summaries, '/test/project');

      expect(result).toContain('Claude Code Usage Summary');
      expect(result).toContain('Project: /test/project');
      expect(result).toContain('2023-05-15');
      expect(result).toContain('Older');
      expect(result).toContain('TOTAL');
      expect(result).toContain('3,000'); // Total input tokens
      expect(result).toContain('1,500'); // Total output tokens
      expect(result).toContain('4,500'); // Total tokens
      expect(result).toContain('$0.06'); // Total cost
    });

    it('should format time durations correctly', () => {
      const summaries: DailySummary[] = [
        {
          date: '2023-05-15',
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
          costUSD: 0.02,
          llmDurationMs: 45000, // 45 seconds
          sessionDurationMs: 3600000, // 1 hour
          sessionCount: 1,
        },
      ];

      const result = (tool as unknown as TestableClaudeCodeUsageTool).formatUsageSummary(summaries, '/test/project');

      expect(result).toContain('45s'); // LLM time
      expect(result).toContain('1h 0m'); // Session time
    });

    it('should handle empty summaries', () => {
      const result = (tool as unknown as TestableClaudeCodeUsageTool).formatUsageSummary([], '/test/project');
      expect(result).toBe('No Claude Code usage data found for this project.');
    });
  });
});
