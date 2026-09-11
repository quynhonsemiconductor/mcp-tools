/**
 * StateManager.test.ts - Unit tests for StateManager
 *
 * Covers the isDirty() method, which reports whether the staged config
 * differs from the saved baseline (originalConfig).
 */

import { describe, expect, it } from 'bun:test';
import { StateManager } from './StateManager.js';

function makeConfig(localMcps: string[] = []): object {
  return {
    tools: {
      include: [],
      exclude: [],
      includeCategories: [],
      excludeCategories: [],
      includeMCPs: [],
      includeRemoteMCPs: [],
      includeLocalMCPs: localMcps,
      mcpArgs: {}
    },
    logging: {
      enabled: true,
      level: 'info',
      maxSize: 5,
      maxFiles: 5
    },
    prompts: {
      repositories: []
    }
  };
}

describe('StateManager', () => {
  describe('isDirty()', () => {
    it('returns false when originalConfig was never set', () => {
      const sm = new StateManager();
      expect(sm.isDirty()).toBe(false);
    });

    it('returns false right after setOriginalConfig when currentConfig equals originalConfig', () => {
      const sm = new StateManager();
      const config = makeConfig([]);
      sm.setCurrentConfig(config);
      sm.setOriginalConfig(config);
      expect(sm.isDirty()).toBe(false);
    });

    it('returns true after staged currentConfig diverges from baseline', () => {
      const sm = new StateManager();
      const baseline = makeConfig([]);
      sm.setCurrentConfig(baseline);
      sm.setOriginalConfig(baseline);

      // Diverge: add an entry to includeLocalMCPs
      const modified = makeConfig(['my-local-server']);
      sm.setCurrentConfig(modified);

      expect(sm.isDirty()).toBe(true);
    });

    it('returns false after setOriginalConfig is called with the current config (simulating a Save)', () => {
      const sm = new StateManager();
      const baseline = makeConfig([]);
      sm.setCurrentConfig(baseline);
      sm.setOriginalConfig(baseline);

      // Make a change
      const modified = makeConfig(['my-local-server']);
      sm.setCurrentConfig(modified);
      expect(sm.isDirty()).toBe(true);

      // Simulate save: record current as the new baseline
      sm.setOriginalConfig(sm.getCurrentConfig());
      expect(sm.isDirty()).toBe(false);
    });

    it('returns false when configs are structurally equal but have different key insertion order', () => {
      const sm = new StateManager();
      // Construct objects with the same content but different key order by hand
      const baseline = { tools: { include: [], includeLocalMCPs: [] } };
      const reordered = { tools: { includeLocalMCPs: [], include: [] } };
      sm.setCurrentConfig(reordered);
      sm.setOriginalConfig(baseline);
      expect(sm.isDirty()).toBe(false);
    });
  });

  describe('observer notifications', () => {
    it('notifies subscriber when setOriginalConfig is called', () => {
      const sm = new StateManager();
      let callCount = 0;
      sm.subscribe(() => { callCount++; });
      sm.setOriginalConfig(makeConfig([]));
      expect(callCount).toBe(1);
    });

    it('notifies subscriber when setCurrentConfig is called', () => {
      const sm = new StateManager();
      let callCount = 0;
      sm.subscribe(() => { callCount++; });
      sm.setCurrentConfig(makeConfig([]));
      expect(callCount).toBe(1);
    });
  });
});
