/**
 * Unit tests for insiders feature gating.
 */

import { describe, expect, it } from 'bun:test';
import { defaultConfig, type QnscMcpConfig } from '../config';
import { isInsidersEnabled } from './insiders';

describe('isInsidersEnabled', () => {
  it('should return false when insiders is not set', () => {
    expect(isInsidersEnabled(defaultConfig)).toBe(false);
  });

  it('should return false when insiders is explicitly false', () => {
    const config: QnscMcpConfig = { ...defaultConfig, insiders: false };
    expect(isInsidersEnabled(config)).toBe(false);
  });

  it('should return true when insiders is true', () => {
    const config: QnscMcpConfig = { ...defaultConfig, insiders: true };
    expect(isInsidersEnabled(config)).toBe(true);
  });

  it('should return false when insiders is undefined', () => {
    const config = { ...defaultConfig } as QnscMcpConfig;
    delete (config as any).insiders;
    expect(isInsidersEnabled(config)).toBe(false);
  });
});
