import { beforeEach, describe, expect, it } from 'bun:test';
import { KnowledgeGraphManager } from './manager';
import { OpenNodesParams, OpenNodesSchema, OpenNodesTool } from './open-nodes-tool';

describe('OpenNodesTool', () => {
  let tool: OpenNodesTool;

  beforeEach(async () => {
    // Clear the graph before each test
    const manager = KnowledgeGraphManager.getInstance();
    await manager.clearGraph();
    tool = new OpenNodesTool();
  });

  it('should validate the schema', () => {
    const schemaShape = OpenNodesSchema.shape;
    expect(Object.keys(schemaShape)).toContain('entityNames');
  });

  describe('Schema Validation', () => {
    it('should validate minimal parameters with defaults', () => {
      const validParams = {
        entityNames: ['entity-1', 'entity-2'],
      };

      const result = OpenNodesSchema.safeParse(validParams);
      expect(result.success).toBe(true);
      expect(result.data?.depth).toBe(1);
      expect(result.data?.includeObservations).toBe(true);
    });

    it('should validate with all parameters', () => {
      const validParams = {
        entityNames: ['entity-1'],
        depth: 3,
        includeObservations: false,
      };

      const result = OpenNodesSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });
    it('should reject missing entityNames', () => {
      const invalidParams = {};

      const result = OpenNodesSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should accept empty entityNames array', () => {
      const validParams = {
        entityNames: [],
      };

      const result = OpenNodesSchema.safeParse(validParams);
      expect(result.success).toBe(true); // Empty array is valid by schema
    });

    it('should reject depth out of range (too low)', () => {
      const invalidParams = {
        entityNames: ['entity-1'],
        depth: 0,
      };

      const result = OpenNodesSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should reject depth out of range (too high)', () => {
      const invalidParams = {
        entityIds: ['entity-1'],
        depth: 6,
      };

      const result = OpenNodesSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Execution', () => {
    it('should be defined and instantiable', () => {
      expect(tool).toBeDefined();
      expect(tool.execute).toBeDefined();
    });
    it('should handle opening nodes with defaults', async () => {
      // Create some test entities to open
      const manager = KnowledgeGraphManager.getInstance();
      await manager.createEntities([
        { name: 'entity-1', entityType: 'concept', observations: ['obs1'] },
        { name: 'entity-2', entityType: 'concept', observations: ['obs2'] },
      ]);

      const params: OpenNodesParams = {
        entityNames: ['entity-1', 'entity-2'],
        depth: 1,
        includeObservations: true,
      };

      const result = await tool.execute(params);
      const jsonResult = JSON.parse(result);
      expect(jsonResult.depth).toBe(1);
      expect(jsonResult.openedEntities).toEqual(['entity-1', 'entity-2']);
      expect(jsonResult.summary).toBeDefined();
    });
    it('should handle custom depth and no observations', async () => {
      // Create some test entities to open
      const manager = KnowledgeGraphManager.getInstance();
      await manager.createEntities([
        { name: 'entity-1', entityType: 'concept', observations: ['obs1'] },
      ]);

      const params: OpenNodesParams = {
        entityNames: ['entity-1'],
        depth: 3,
        includeObservations: false,
      };

      const result = await tool.execute(params);
      const jsonResult = JSON.parse(result);
      expect(jsonResult.depth).toBe(3);
      expect(jsonResult.openedEntities).toEqual(['entity-1']);
      expect(jsonResult.summary).toBeDefined();
    });

    it('should handle single entity', async () => {
      const params: OpenNodesParams = {
        entityNames: ['single-entity'],
        depth: 2,
        includeObservations: true,
      };

      const result = await tool.execute(params);
      const jsonResult = JSON.parse(result);
      expect(jsonResult.depth).toBe(2);
      expect(jsonResult.openedEntities).toEqual(['single-entity']);
      expect(jsonResult.summary).toBeDefined();
    });

    it('should handle multiple entities with custom settings', async () => {
      const params: OpenNodesParams = {
        entityNames: ['entity-a', 'entity-b', 'entity-c'],
        depth: 4,
        includeObservations: true,
      };

      const result = await tool.execute(params);
      const jsonResult = JSON.parse(result);
      expect(jsonResult.depth).toBe(4);
      expect(jsonResult.openedEntities).toEqual(['entity-a', 'entity-b', 'entity-c']);
      expect(jsonResult.summary).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      // Mock the manager to throw an error
      const originalOpenNodes = KnowledgeGraphManager.prototype.openNodes;
      KnowledgeGraphManager.prototype.openNodes = async () => {
        throw new Error('Node access restricted');
      };

      const params: OpenNodesParams = {
        entityNames: ['test-entity'],
        depth: 1,
        includeObservations: true,
      };

      let error: unknown;
      try {
        await tool.execute(params);
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect((error as Error).message).toContain('Tool execution error');

      // Restore original method
      KnowledgeGraphManager.prototype.openNodes = originalOpenNodes;
    });

    it('should handle non-existent entities gracefully', async () => {
      const params: OpenNodesParams = {
        entityNames: ['non-existent-entity-1', 'non-existent-entity-2'],
        depth: 1,
        includeObservations: true,
      };
      let error: unknown;
      try {
        const result = await tool.execute(params);
        const jsonResult = JSON.parse(result);
        expect(jsonResult.openedEntities).toEqual([
          'non-existent-entity-1',
          'non-existent-entity-2',
        ]);
        expect(jsonResult.summary.entityCount).toBe(0);
      } catch (e) {
        error = e;
      }

      // Non-existent entities should be handled gracefully
      expect(error).toBeUndefined();
    });
  });
});
