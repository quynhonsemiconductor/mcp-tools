import { beforeEach, describe, expect, it } from 'bun:test';
import {
  DeleteEntitiesParams,
  DeleteEntitiesSchema,
  DeleteEntitiesTool,
} from './delete-entities-tool';
import { KnowledgeGraphManager } from './manager';

describe('DeleteEntitiesTool', () => {
  let tool: DeleteEntitiesTool;

  beforeEach(() => {
    tool = new DeleteEntitiesTool();
  });

  describe('Schema Validation', () => {
    it('should validate correct entity names structure', () => {
      const validParams = {
        entityNames: ['entity-1', 'entity-2', 'entity-3'],
      };

      const result = DeleteEntitiesSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('should reject missing entityNames', () => {
      const invalidParams = {};

      const result = DeleteEntitiesSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should accept empty entityNames array', () => {
      const validParams = {
        entityNames: [],
      };

      const result = DeleteEntitiesSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });
  });

  describe('Tool Execution', () => {
    it('should be defined and instantiable', () => {
      expect(tool).toBeDefined();
      expect(tool.execute).toBeDefined();
    });
    it('should return success message with entity count and list', async () => {
      const params: DeleteEntitiesParams = {
        entityNames: ['entity-1', 'entity-2'],
      };

      const result = await tool.execute(params);
      expect(result).toContain('Successfully deleted 2 entities');
      expect(result).toContain('entity-1, entity-2');
    });

    it('should handle single entity deletion', async () => {
      const params: DeleteEntitiesParams = {
        entityNames: ['single-entity'],
      };

      const result = await tool.execute(params);
      expect(result).toContain('Successfully deleted 1 entities');
      expect(result).toContain('single-entity');
    });

    it('should handle empty entity list', async () => {
      const params: DeleteEntitiesParams = {
        entityNames: [],
      };

      const result = await tool.execute(params);
      expect(result).toContain('Successfully deleted 0 entities');
    });

    it('should handle errors gracefully', async () => {
      // Mock the manager to throw an error
      const originalDeleteEntities = KnowledgeGraphManager.prototype.deleteEntities;
      KnowledgeGraphManager.prototype.deleteEntities = async () => {
        throw new Error('Permission denied');
      };

      const params: DeleteEntitiesParams = {
        entityNames: ['test-entity'],
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
      KnowledgeGraphManager.prototype.deleteEntities = originalDeleteEntities;
    });

    it('should handle non-existent entities gracefully', async () => {
      const params: DeleteEntitiesParams = {
        entityNames: ['non-existent-entity-1', 'non-existent-entity-2'],
      };
      let error: unknown;
      try {
        const result = await tool.execute(params);
        expect(result).toContain('Successfully deleted 2 entities');
        expect(result).toContain('non-existent-entity-1, non-existent-entity-2');
      } catch (e) {
        error = e;
      }

      // Non-existent entities should not cause error
      expect(error).toBeUndefined();
    });
  });
});
