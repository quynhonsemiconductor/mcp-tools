import { describe, expect, it } from 'bun:test';
import logger, { logDebug, logError, logInfo, logWarn } from './logging';

describe('McpLogger', () => {
  it('should export a logger instance with required methods', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
  });

  it('should expose log file path accessors', () => {
    expect(typeof logger.getLogFile).toBe('function');
    expect(typeof logger.getLogDir).toBe('function');
    expect(logger.getLogFile()).toContain('mcp-tools.log');
    expect(logger.getLogDir()).toContain('logs');
  });

  it('should export helper functions', () => {
    expect(typeof logDebug).toBe('function');
    expect(typeof logInfo).toBe('function');
    expect(typeof logError).toBe('function');
    expect(typeof logWarn).toBe('function');
  });

  // These tests verify that the methods don't throw errors
  it('should be able to call class methods without errors', () => {
    expect(() => logger.debug('Test debug message')).not.toThrow();
    expect(() => logger.info('Test info message')).not.toThrow();
    expect(() => logger.warn('Test warn message')).not.toThrow();
    expect(() => logger.error('Test error message')).not.toThrow();
  });

  it('should be able to call class methods with data objects', () => {
    expect(() => logger.debug('Debug with data', { debug: 'data' })).not.toThrow();
    expect(() => logger.info('Info with data', { info: 'data' })).not.toThrow();
    expect(() => logger.warn('Warn with data', { warn: 'data' })).not.toThrow();
    expect(() => logger.error('Error with data', { error: 'data' })).not.toThrow();
  });

  it('should be able to call helper functions without errors', () => {
    expect(() => logDebug('Helper debug message')).not.toThrow();
    expect(() => logInfo('Helper info message')).not.toThrow();
    expect(() => logWarn('Helper warn message')).not.toThrow();
    expect(() => logError('Helper error message')).not.toThrow();
  });

  it('should be able to call helper functions with data objects', () => {
    expect(() => logDebug('Helper debug with data', { debug: 'data' })).not.toThrow();
    expect(() => logInfo('Helper info with data', { info: 'data' })).not.toThrow();
    expect(() => logWarn('Helper warn with data', { warn: 'data' })).not.toThrow();
    expect(() => logError('Helper error with data', { error: 'data' })).not.toThrow();
  });
});
