import { beforeEach, describe, expect, it } from 'bun:test';
import {
  DeleteRelationsParams,
  DeleteRelationsSchema,
  DeleteRelationsTool,
} from './delete-relations-tool';
import { KnowledgeGraphManager } from './manager';

describe('DeleteRelationsTool', () => {
  let tool: DeleteRelationsTool;

  beforeEach(() => {
    tool = new DeleteRelationsTool();
  });
  describe('Schema Validation', () => {
    it('should validate correct relations structure', () => {
      const validParams = {
        relations: [
          { from: 'entity1', to: 'entity2', relationType: 'connected_to' },
          { from: 'entity2', to: 'entity3', relationType: 'depends_on' },
        ],
      };

      const result = DeleteRelationsSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('should reject missing relations', () => {
      const invalidParams = {};

      const result = DeleteRelationsSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should reject relations with missing from field', () => {
      const invalidParams = {
        relations: [{ to: 'entity2', relationType: 'connected_to' }],
      };

      const result = DeleteRelationsSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should reject relations with missing to field', () => {
      const invalidParams = {
        relations: [{ from: 'entity1', relationType: 'connected_to' }],
      };

      const result = DeleteRelationsSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should reject relations with missing relationType field', () => {
      const invalidParams = {
        relations: [{ from: 'entity1', to: 'entity2' }],
      };

      const result = DeleteRelationsSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });
  });
  describe('Tool Execution', () => {
    it('should be defined and instantiable', () => {
      expect(tool).toBeDefined();
      expect(tool.execute).toBeDefined();
    });

    it('should handle deletion of specific relations', async () => {
      const params: DeleteRelationsParams = {
        relations: [
          { from: 'entity1', to: 'entity2', relationType: 'connected_to' },
          { from: 'entity2', to: 'entity3', relationType: 'depends_on' },
        ],
      };

      const result = await tool.execute(params);
      expect(result).toContain('Successfully deleted 2 relations');
      expect(result).toContain('entity1 -> entity2 (connected_to)');
      expect(result).toContain('entity2 -> entity3 (depends_on)');
    });

    it('should handle single relation deletion', async () => {
      const params: DeleteRelationsParams = {
        relations: [{ from: 'entity1', to: 'entity2', relationType: 'connected_to' }],
      };

      const result = await tool.execute(params);
      expect(result).toContain('Successfully deleted 1 relations');
      expect(result).toContain('entity1 -> entity2 (connected_to)');
    });

    it('should handle empty relations array', async () => {
      const params: DeleteRelationsParams = {
        relations: [],
      };

      const result = await tool.execute(params);
      expect(result).toContain('Successfully deleted 0 relations');
    });

    it('should handle errors gracefully', async () => {
      // Mock the manager to throw an error
      const originalDeleteRelations = KnowledgeGraphManager.prototype.deleteRelations;
      KnowledgeGraphManager.prototype.deleteRelations = async () => {
        throw new Error('Network timeout');
      };

      const params: DeleteRelationsParams = {
        relations: [
          {
            from: 'entity1',
            to: 'entity2',
            relationType: 'test_relation',
          },
        ],
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
      KnowledgeGraphManager.prototype.deleteRelations = originalDeleteRelations;
    });

    it('should handle invalid relation criteria gracefully', async () => {
      const params: DeleteRelationsParams = {
        relations: [
          {
            from: 'non-existent-entity',
            to: 'another-non-existent-entity',
            relationType: 'fake_relation',
          },
        ],
      };
      let error: unknown;
      try {
        const result = await tool.execute(params);
        expect(result).toContain('Successfully deleted 1 relations');
        expect(result).toContain(
          'non-existent-entity -> another-non-existent-entity (fake_relation)',
        );
      } catch (e) {
        error = e;
      }

      // Invalid relations should be handled gracefully
      expect(error).toBeUndefined();
    });
  });
});
