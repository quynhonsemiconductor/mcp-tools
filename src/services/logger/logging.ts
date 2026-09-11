/**
 * Simple file-based logger for MCP Tools
 * Avoids circular dependencies with config.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

// Simple log level enum
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// Field names redacted from logged `data` payloads, case-insensitive.
// This CLI handles OAuth tokens/DB credentials — never write these to disk or telemetry.
const REDACTED_KEYS = new Set([
  'authorization',
  'cookie',
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'apikey',
  'api_key',
  'x-api-key',
  'secret',
  'clientsecret',
  'client_secret',
]);
const REDACTED_VALUE = '[REDACTED]';

function redactSensitive(data: unknown): unknown {
  const value: unknown = data;
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(redactSensitive);
  }
  const result: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    result[key] = REDACTED_KEYS.has(key.toLowerCase())
      ? REDACTED_VALUE
      : redactSensitive(entryValue);
  }
  return result;
}

// Basic logger class
class McpLogger {
  private logDir: string;
  private logFile: string;
  private enabled: boolean;
  private logLevel: LogLevel;
  private maxSize: number; // in MB
  private maxFiles: number;
  private initialized: boolean;

  constructor() {
    // Initialize with defaults that don't depend on config
    this.logDir = path.join(os.homedir(), '.qnscmcp', 'logs'); // Directly construct path to avoid circular dependency
    this.logFile = path.join(this.logDir, 'mcp-tools.log');
    this.enabled = true;
    this.logLevel = LogLevel.INFO;
    this.maxSize = 10; // 10MB
    this.maxFiles = 5;
    this.initialized = false;

    // Defer configuration loading until first use
    // This breaks the circular dependency
    this.ensureLogDir();
  }

  // Lazy-load configuration when needed
  private loadConfigIfNeeded(): void {
    if (this.initialized) {
      return;
    }

    try {
      // Now it's safe to import config
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional lazy require to avoid circular dependency with config.ts
      const { loadConfig } = require('../../config') as typeof import('../../config');

      const config = loadConfig();
      if (config.logging) {
        if (typeof config.logging.enabled === 'boolean') {
          this.enabled = config.logging.enabled;
        }

        if (typeof config.logging.level === 'string') {
          switch (config.logging.level.toLowerCase()) {
            case 'debug':
              this.logLevel = LogLevel.DEBUG;
              break;
            case 'info':
              this.logLevel = LogLevel.INFO;
              break;
            case 'warn':
              this.logLevel = LogLevel.WARN;
              break;
            case 'error':
              this.logLevel = LogLevel.ERROR;
              break;
          }
        }

        if (typeof config.logging.maxSize === 'number') {
          this.maxSize = config.logging.maxSize;
        }

        if (typeof config.logging.maxFiles === 'number') {
          this.maxFiles = config.logging.maxFiles;
        }
      }
    } catch (error) {
      // Log the error instead of silently failing, fallback to defaults
      console.error(`Error loading logger config:`, error);
    } finally {
      // Regardless of config loading result or fallback, indicate that initialization is complete
      // Setting this flag prevents infinite recursion with circular dependencies
      this.initialized = true;
    }
  }

  // Create log directory if needed
  private ensureLogDir(): void {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch {
      // Silently fail - we'll check before writing anyway
    }
  }

  // Check if log file should be rotated
  private checkRotation(): void {
    try {
      if (!fs.existsSync(this.logFile)) {
        return;
      }

      const stats = fs.statSync(this.logFile);
      const fileSizeInMB = stats.size / (1024 * 1024);

      if (fileSizeInMB > this.maxSize) {
        // Rotate files
        for (let i = this.maxFiles - 1; i > 0; i--) {
          const oldFile = `${this.logFile}.${i}`;
          const newFile = `${this.logFile}.${i + 1}`;

          if (fs.existsSync(oldFile) && i < this.maxFiles) {
            fs.renameSync(oldFile, newFile);
          }
        }

        if (fs.existsSync(this.logFile)) {
          fs.renameSync(this.logFile, `${this.logFile}.1`);
        }
      }
    } catch {
      // Silently fail rotation
    }
  }

  // Core log writing function
  private write(level: LogLevel, message: string, data?: unknown): void {
    // Lazily load config on first use
    this.loadConfigIfNeeded();

    if (!this.enabled || level < this.logLevel) {
      return;
    }

    try {
      this.checkRotation();

      // Format the log entry
      const timestamp = new Date().toISOString();
      const levelName = LogLevel[level];
      const safeData = data ? redactSensitive(data) : data;
      const logData = safeData ? JSON.stringify(safeData) : '';
      const logMessage = `${timestamp} [${levelName}] ${message}${logData ? ' ' + logData : ''}\n`;

      // Log errors to the console, since these write to stderr they are emitted in the IDE output and do not interfere with stdio
      if (level === LogLevel.ERROR) {
        console.error(`[${levelName}] ${message}${logData ? ' ' + logData : ''}`);
      }

      // Ensure log directory exists before writing
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }

      // Append to log file
      fs.appendFileSync(this.logFile, logMessage);

      // Send INFO+ logs to telemetry (async, non-blocking)
      // DEBUG excluded: contains verbose operational data (API responses, env var names)
      if (level >= LogLevel.INFO) {
        this.sendToTelemetry(levelName, message, safeData);
      }
    } catch {
      // Silent fail in production
    }
  }

  /**
   * Send log entry to telemetry service (async, non-blocking).
   * Uses dynamic import to avoid circular dependencies with telemetry service.
   */
  private sendToTelemetry(level: string, message: string, data?: unknown): void {
    // Use setImmediate to make this non-blocking and avoid impacting log performance
    setImmediate(async () => {
      try {
        // Dynamic import to break circular dependency
        const telemetryModule = await import('../telemetry');
        const telemetry = telemetryModule.default;

        // Only send if telemetry is enabled (respects TELEMETRY=false)
        if (telemetry.isEnabled()) {
          telemetry.recordLog({
            level: level as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
            message,
            data,
          });
        }
      } catch {
        // Silently fail - telemetry should never break logging
      }
    });
  }

  // Public logging methods
  public debug(message: string, data?: unknown): void {
    this.write(LogLevel.DEBUG, message, data);
  }

  public info(message: string, data?: unknown): void {
    this.write(LogLevel.INFO, message, data);
  }

  public warn(message: string, data?: unknown): void {
    this.write(LogLevel.WARN, message, data);
  }

  public error(message: string, data?: unknown): void {
    this.write(LogLevel.ERROR, message, data);
  }

  // Accessor methods
  public getLogFile(): string {
    return this.logFile;
  }

  public getLogDir(): string {
    return this.logDir;
  }
}

// First create class instance
const logger = new McpLogger();

// Export path constants
export const LOG_DIR = logger.getLogDir();
export const LOG_FILE = logger.getLogFile();

// Export simple helper functions that call the logger instance
export function logDebug(message: string, data?: unknown): void {
  logger.debug(message, data);
}

export function logInfo(message: string, data?: unknown): void {
  logger.info(message, data);
}

export function logWarn(message: string, data?: unknown): void {
  logger.warn(message, data);
}

export function logError(message: string, data?: unknown): void {
  logger.error(message, data);
}

// Export the singleton instance as default
export default logger;
