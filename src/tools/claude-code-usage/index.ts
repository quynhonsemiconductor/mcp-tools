import * as fs from 'fs';
import { createReadStream } from 'fs';
import * as os from 'os';
import * as path from 'path';
import readline from 'readline';
import { logInfo } from '../../services/logger';
import { CatchErrors, UserError } from '../../utils';
import { Tool, ToolHandler } from '../registry';

import { z } from 'zod';

/**
 * Schema definition for the getClaudeCodeUsage tool parameters
 */
export const ClaudeCodeUsageToolSchema = z.object({
  projectPath: z
    .string()
    .optional()
    .describe('Project path to analyze. If not provided, current directory will be used.'),
});

/**
 * Type for the getClaudeCodeUsage tool parameters
 */
export type ClaudeCodeUsageToolParams = z.infer<typeof ClaudeCodeUsageToolSchema>;
/**
 * Interface for usage data extracted from log files
 */
export interface UsageData {
  date: Date;
  sessionId?: string;
  inputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
  costUSD: number;
  durationMs: number;
}
/**
 * Interface to track session timestamps
 */
export interface SessionTimeInfo {
  sessionId: string;
  minTimestamp: Date;
  maxTimestamp: Date;
}
/**
 * Interface for daily usage summary
 */
export interface DailySummary {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUSD: number;
  llmDurationMs: number; // Time spent by LLM processing
  sessionDurationMs: number; // Total time spent in sessions
  sessionCount: number;
}

/** Shape of a single JSONL line in a Claude Code project log file */
interface ClaudeCodeLogEntry {
  timestamp?: string;
  costUSD?: number;
  durationMs?: number;
  message?: {
    usage?: {
      input_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      output_tokens?: number;
    };
  };
}

/**
 * getClaudeCodeUsage - Retrieve the usage statistics for Claude Code in the current project
 */
@Tool({
  id: 'claude-code-usage',
  name: 'getClaudeCodeUsage',
  description: 'Retrieve the usage statistics for a Claude Code project.',
  category: 'Utility',
  parameters: ClaudeCodeUsageToolSchema,
  version: '1.0.0',
  annotations: {
    title: 'Claude Code Usage',
    readOnlyHint: true,
  },
})
export class ClaudeCodeUsageTool implements ToolHandler {
  /**
   * Execute the tool
   */
  @CatchErrors()
  async execute(args: ClaudeCodeUsageToolParams): Promise<string> {
    // Log tool execution start
    logInfo(`Executing Claude Code usage tool`);

    // Get project path (use provided path or current directory)
    const projectPath = args.projectPath || process.cwd();
    logInfo(`Analyzing project path: ${projectPath}`);

    // Find project log files
    const logFiles = await this.findProjectLogFiles(projectPath);
    logInfo(`Found ${logFiles.length} log files`);

    // Parse log files and collect usage data
    const { usageData, sessionTimeInfo } = await this.parseLogFiles(logFiles);
    logInfo(`Parsed ${usageData.length} usage entries`);

    // Group usage by date
    const dailySummaries = this.groupUsageByDate(usageData, sessionTimeInfo);

    // Format and return the result
    const result = this.formatUsageSummary(dailySummaries, projectPath);

    return result;
  }

  /**
   * Finds Claude Code log files for the current project
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- kept async so test subclasses can override with async behavior without touching call sites; this base implementation is synchronous
  protected async findProjectLogFiles(projectPath: string): Promise<string[]> {
    try {
      // Convert project path to Claude directory format
      const normalizedPath = path.resolve(projectPath); // Ensure absolute path

      // Replace all non-alphanumeric characters with hyphens
      const projectDir = normalizedPath.replace(/[^a-zA-Z0-9]/g, '-');
      const claudeDir = path.join(os.homedir(), '.claude', 'projects', projectDir);

      // Check if directory exists
      if (!fs.existsSync(claudeDir)) {
        throw new UserError(`No Claude logs found for this project: ${claudeDir}`);
      }

      // Get all jsonl files
      const files = fs
        .readdirSync(claudeDir)
        .filter((file) => file.endsWith('.jsonl'))
        .map((file) => path.join(claudeDir, file));

      return files;
    } catch (error) {
      if (error instanceof UserError) throw error;
      throw new UserError(
        `Error finding log files: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Parses log files to extract usage data
   */
  protected async parseLogFiles(logFiles: string[]): Promise<{
    usageData: UsageData[];
    sessionTimeInfo: Map<string, SessionTimeInfo>;
  }> {
    const usageData: UsageData[] = [];
    // Map to track session timestamps
    const sessionTimeInfo = new Map<string, SessionTimeInfo>();

    for (const file of logFiles) {
      try {
        // Extract session ID from filename (UUID part before .jsonl)
        const filename = path.basename(file);
        const sessionId = filename.replace('.jsonl', '');

        // Initialize session time info
        sessionTimeInfo.set(sessionId, {
          sessionId,
          minTimestamp: new Date(8640000000000000), // Max date - will be replaced with first timestamp
          maxTimestamp: new Date(0), // Min date - will be replaced with last timestamp
        });

        // Create readline interface to process file line by line
        const fileStream = createReadStream(file);
        const rl = readline.createInterface({
          input: fileStream,
          crlfDelay: Infinity,
        });

        // Process each line
        for await (const line of rl) {
          try {
            // Parse JSON line
            const entry = JSON.parse(line) as ClaudeCodeLogEntry;

            // Parse entry timestamp
            if (entry.timestamp) {
              const timestamp = new Date(entry.timestamp);

              // Update session min/max timestamps
              const timeInfo = sessionTimeInfo.get(sessionId)!;
              if (timestamp < timeInfo.minTimestamp) {
                timeInfo.minTimestamp = timestamp;
              }
              if (timestamp > timeInfo.maxTimestamp) {
                timeInfo.maxTimestamp = timestamp;
              }

              // Check if line contains usage data
              if (entry.message?.usage && entry.costUSD) {
                const usage = entry.message.usage;

                usageData.push({
                  date: timestamp,
                  sessionId: sessionId, // Use the filename-derived session ID
                  inputTokens: usage.input_tokens || 0,
                  cacheCreationInputTokens: usage.cache_creation_input_tokens || 0,
                  cacheReadInputTokens: usage.cache_read_input_tokens || 0,
                  outputTokens: usage.output_tokens || 0,
                  costUSD: entry.costUSD || 0,
                  durationMs: entry.durationMs || 0,
                });
              }
            }
          } catch {
            // Skip invalid JSON lines
            continue;
          }
        }
      } catch (fileError) {
        // Log error but continue with other files
        logInfo(
          `Error processing file ${file}: ${fileError instanceof Error ? fileError.message : String(fileError)}`,
        );
        continue;
      }
    }

    return { usageData, sessionTimeInfo };
  }

  /**
   * Groups usage data by date
   */
  protected groupUsageByDate(
    usageData: UsageData[],
    sessionTimeInfo: Map<string, SessionTimeInfo>,
  ): DailySummary[] {
    // Get current date for determining the last 7 days
    const today = new Date();
    const last7Days = new Date(today);
    last7Days.setDate(today.getDate() - 7);

    // Track daily summaries and older aggregate
    const dailyMap = new Map<string, DailySummary>();
    const olderSummary: DailySummary = {
      date: 'Older',
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUSD: 0,
      llmDurationMs: 0,
      sessionDurationMs: 0,
      sessionCount: 0,
    };

    // Track unique sessions by date
    const sessionsByDate = new Map<string, Set<string>>();
    sessionsByDate.set('Older', new Set<string>());

    // Process each usage entry
    for (const entry of usageData) {
      const entryDate = entry.date;
      const dateKey = entryDate >= last7Days ? entryDate.toISOString().split('T')[0] : 'Older';

      const totalInputTokens =
        entry.inputTokens + entry.cacheCreationInputTokens + entry.cacheReadInputTokens;

      if (dateKey === 'Older') {
        // Aggregate older entries
        olderSummary.inputTokens += totalInputTokens;
        olderSummary.outputTokens += entry.outputTokens;
        olderSummary.totalTokens += totalInputTokens + entry.outputTokens;
        olderSummary.costUSD += entry.costUSD;
        olderSummary.llmDurationMs += entry.durationMs;

        // Track session
        if (entry.sessionId) {
          sessionsByDate.get('Older')!.add(entry.sessionId);
        }
      } else {
        // Create or update daily summary
        if (!dailyMap.has(dateKey)) {
          dailyMap.set(dateKey, {
            date: dateKey,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            costUSD: 0,
            llmDurationMs: 0,
            sessionDurationMs: 0,
            sessionCount: 0,
          });
        }

        const summary = dailyMap.get(dateKey)!;
        summary.inputTokens += totalInputTokens;
        summary.outputTokens += entry.outputTokens;
        summary.totalTokens += totalInputTokens + entry.outputTokens;
        summary.costUSD += entry.costUSD;
        summary.llmDurationMs += entry.durationMs;

        // Create set for this date if it doesn't exist yet
        if (!sessionsByDate.has(dateKey)) {
          sessionsByDate.set(dateKey, new Set<string>());
        }

        // Track session
        if (entry.sessionId) {
          sessionsByDate.get(dateKey)!.add(entry.sessionId);
        }
      }
    }

    // Update session counts and calculate session duration from our tracking
    for (const [dateKey, sessions] of sessionsByDate.entries()) {
      if (dateKey === 'Older') {
        olderSummary.sessionCount = sessions.size;

        // Calculate session duration for older entries
        for (const sessionId of sessions) {
          const timeInfo = sessionTimeInfo.get(sessionId);
          if (timeInfo && timeInfo.maxTimestamp > timeInfo.minTimestamp) {
            const sessionDuration =
              timeInfo.maxTimestamp.getTime() - timeInfo.minTimestamp.getTime();
            olderSummary.sessionDurationMs += sessionDuration;
          }
        }
      } else if (dailyMap.has(dateKey)) {
        const summary = dailyMap.get(dateKey)!;
        summary.sessionCount = sessions.size;

        // Calculate session duration for this day
        for (const sessionId of sessions) {
          const timeInfo = sessionTimeInfo.get(sessionId);
          if (timeInfo && timeInfo.maxTimestamp > timeInfo.minTimestamp) {
            const sessionDuration =
              timeInfo.maxTimestamp.getTime() - timeInfo.minTimestamp.getTime();
            summary.sessionDurationMs += sessionDuration;
          }
        }
      }
    }

    // Convert map to array and sort by date (descending)
    const dailySummaries = Array.from(dailyMap.values()).sort((a, b) =>
      b.date.localeCompare(a.date),
    );

    // Add older summary if it has data
    if (olderSummary.totalTokens > 0) {
      dailySummaries.push(olderSummary);
    }

    return dailySummaries;
  }

  /**
   * Formats usage summaries into readable output
   */
  protected formatUsageSummary(summaries: DailySummary[], projectPath: string): string {
    if (summaries.length === 0) {
      return 'No Claude Code usage data found for this project.';
    }

    // Calculate totals
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalAllTokens = 0;
    let totalCost = 0;
    let totalLlmDurationMs = 0;
    let totalSessionDurationMs = 0;
    let totalSessions = 0;

    for (const summary of summaries) {
      totalInputTokens += summary.inputTokens;
      totalOutputTokens += summary.outputTokens;
      totalAllTokens += summary.totalTokens;
      totalCost += summary.costUSD;
      totalLlmDurationMs += summary.llmDurationMs;
      totalSessionDurationMs += summary.sessionDurationMs;
      totalSessions += summary.sessionCount;
    }

    // Format the summary table
    let result = '# Claude Code Usage Summary\n\n';
    result += `Project: ${projectPath}\n\n`;

    // Format the table
    result +=
      '| Date | Input Tokens | Output Tokens | Total Tokens | LLM Time | Session Time | Sessions | Cost (USD) |\n';
    result +=
      '|------|--------------|--------------|--------------|----------|-------------|----------|------------|\n';

    // Helper function to format duration
    const formatDuration = (ms: number): string => {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);

      if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
      } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
      } else {
        return `${seconds}s`;
      }
    };

    for (const summary of summaries) {
      const llmTime = formatDuration(summary.llmDurationMs);
      const sessionTime = formatDuration(summary.sessionDurationMs);

      result += `| ${summary.date} | ${summary.inputTokens.toLocaleString()} | `;
      result += `${summary.outputTokens.toLocaleString()} | ${summary.totalTokens.toLocaleString()} | `;
      result += `${llmTime} | ${sessionTime} | ${summary.sessionCount} | `;
      result += `$${summary.costUSD.toFixed(2)} |\n`;
    }

    // Add total row
    result +=
      '|------|--------------|--------------|--------------|----------|-------------|----------|------------|\n';
    result += `| **TOTAL** | **${totalInputTokens.toLocaleString()}** | `;
    result += `**${totalOutputTokens.toLocaleString()}** | **${totalAllTokens.toLocaleString()}** | `;
    result += `**${formatDuration(totalLlmDurationMs)}** | **${formatDuration(totalSessionDurationMs)}** | **${totalSessions}** | `;
    result += `**$${totalCost.toFixed(2)}** |\n\n`;

    return result;
  }
}
