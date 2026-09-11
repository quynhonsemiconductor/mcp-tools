import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { setupStandardMocks } from '../../test-utils/mocks';
const { mockFS } = setupStandardMocks();

import { Entity, KnowledgeGraphManager, Relation } from './manager';

describe.skip('KnowledgeGraphManager', () => {
  let tempFilePath: string;
  let manager: KnowledgeGraphManager;

  beforeEach(async () => {
    tempFilePath = './knowledge-graph.json';

    // mockFS.promises.readFile.mockReset();
    // mockFS.promises.writeFile.mockReset();
    // mockFS.promises.access.mockReset();

    // Override the private memoryFilePath by accessing it through the prototype
    const managerInstance = KnowledgeGraphManager.getInstance();
    (managerInstance as unknown as { memoryFilePath: string }).memoryFilePath = tempFilePath;

    // Reset the singleton and get a fresh instance for each test
    KnowledgeGraphManager.reset();
    manager = KnowledgeGraphManager.getInstance();
    (manager as unknown as { memoryFilePath: string }).memoryFilePath = tempFilePath;
  });

  afterEach(async () => {});

  describe('Initialization', () => {
    test('should create manager instance', () => {
      expect(manager).toBeDefined();
      expect(manager).toBeInstanceOf(KnowledgeGraphManager);
    });

    test('should return same instance on multiple calls', () => {
      const manager1 = KnowledgeGraphManager.getInstance();
      const manager2 = KnowledgeGraphManager.getInstance();
      expect(manager1).toBe(manager2);
    });
  });

  describe('Graph Operations', () => {
    test('should handle empty graph initially', async () => {
      const graph = await manager.readGraph();
      expect(graph.entities).toEqual([]);
      expect(graph.relations).toEqual([]);
    });

    test('should create entities', async () => {
      const entities: Entity[] = [
        {
          name: 'TestEntity',
          entityType: 'Test',
          observations: ['Test observation'],
        },
      ];

      const created = await manager.createEntities(entities);
      expect(created).toHaveLength(1);
      expect(created[0].name).toBe('TestEntity');

      const graph = await manager.readGraph();
      expect(graph.entities).toHaveLength(1);
      expect(graph.entities[0].name).toBe('TestEntity');
    });

    test('should create relations', async () => {
      // First create entities
      const entities: Entity[] = [
        { name: 'Entity1', entityType: 'Type1', observations: [] },
        { name: 'Entity2', entityType: 'Type2', observations: [] },
      ];
      await manager.createEntities(entities);

      // Then create relations
      const relations: Relation[] = [
        {
          from: 'Entity1',
          to: 'Entity2',
          relationType: 'connects_to',
        },
      ];

      const created = await manager.createRelations(relations);
      expect(created).toHaveLength(1);

      const graph = await manager.readGraph();
      expect(graph.relations).toHaveLength(1);
      expect(graph.relations[0].from).toBe('Entity1');
    });

    test('should add observations to existing entities', async () => {
      // Create entity first
      const entities: Entity[] = [
        {
          name: 'TestEntity',
          entityType: 'Test',
          observations: ['Initial observation'],
        },
      ];
      await manager.createEntities(entities);

      // Add observations
      const observations = [
        {
          entityName: 'TestEntity',
          contents: ['New observation 1', 'New observation 2'],
        },
      ];

      const result = await manager.addObservations(observations);
      expect(result[0].addedObservations).toHaveLength(2);

      const graph = await manager.readGraph();
      expect(graph.entities[0].observations).toHaveLength(3);
    });

    test('should delete entities', async () => {
      // Create entities first
      const entities: Entity[] = [
        { name: 'Entity1', entityType: 'Type1', observations: [] },
        { name: 'Entity2', entityType: 'Type2', observations: [] },
      ];
      await manager.createEntities(entities);

      // Delete one entity
      await manager.deleteEntities(['Entity1']);

      const graph = await manager.readGraph();
      expect(graph.entities).toHaveLength(1);
      expect(graph.entities[0].name).toBe('Entity2');
    });

    test('should delete observations', async () => {
      // Create entity with observations
      const entities: Entity[] = [
        {
          name: 'TestEntity',
          entityType: 'Test',
          observations: ['Obs1', 'Obs2', 'Obs3'],
        },
      ];
      await manager.createEntities(entities);

      // Delete specific observations
      const deletions = [
        {
          entityName: 'TestEntity',
          observations: ['Obs1', 'Obs3'],
        },
      ];

      await manager.deleteObservations(deletions);

      const graph = await manager.readGraph();
      expect(graph.entities[0].observations).toHaveLength(1);
      expect(graph.entities[0].observations[0]).toBe('Obs2');
    });

    test('should delete relations', async () => {
      // Create entities and relations
      const entities: Entity[] = [
        { name: 'Entity1', entityType: 'Type1', observations: [] },
        { name: 'Entity2', entityType: 'Type2', observations: [] },
      ];
      await manager.createEntities(entities);

      const relations: Relation[] = [
        { from: 'Entity1', to: 'Entity2', relationType: 'connects_to' },
        { from: 'Entity2', to: 'Entity1', relationType: 'relates_to' },
      ];
      await manager.createRelations(relations);

      // Delete one relation
      await manager.deleteRelations([relations[0]]);

      const graph = await manager.readGraph();
      expect(graph.relations).toHaveLength(1);
      expect(graph.relations[0].relationType).toBe('relates_to');
    });

    test('should search nodes', async () => {
      // Create test data
      const entities: Entity[] = [
        {
          name: 'TestEntity',
          entityType: 'Test',
          observations: ['Important data'],
        },
        {
          name: 'OtherEntity',
          entityType: 'Other',
          observations: ['Different data'],
        },
      ];
      await manager.createEntities(entities);

      const result = await manager.searchNodes('Test');
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('TestEntity');
    });

    test('should open specific nodes', async () => {
      // Create test data
      const entities: Entity[] = [
        { name: 'Entity1', entityType: 'Type1', observations: [] },
        { name: 'Entity2', entityType: 'Type2', observations: [] },
        { name: 'Entity3', entityType: 'Type3', observations: [] },
      ];
      await manager.createEntities(entities);

      const result = await manager.openNodes(['Entity1', 'Entity3']);
      expect(result.entities).toHaveLength(2);
      expect(result.entities.map((e) => e.name).sort()).toEqual(['Entity1', 'Entity3']);
    });
  });

  describe('Error Handling', () => {
    test('should throw error when adding observations to non-existent entity', async () => {
      const observations = [
        {
          entityName: 'NonExistent',
          contents: ['Some observation'],
        },
      ];

      try {
        await manager.addObservations(observations);
        expect().fail('Expected an error to be thrown but no error was thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Entity with name NonExistent not found');
      }
    });
  });

  describe('File Persistence', () => {
    test('should persist data to file', async () => {
      const entities: Entity[] = [
        { name: 'PersistTest', entityType: 'Test', observations: ['Test data'] },
      ];
      await manager.createEntities(entities);

      expect(mockFS.promises.writeFile).toHaveBeenCalledWith(tempFilePath, expect.any(String));
      // expect(content).toContain('PersistTest');
    });

    test('should load data from file', async () => {
      // Write test data directly to file
      const testData = [
        JSON.stringify({
          type: 'entity',
          name: 'LoadTest',
          entityType: 'Test',
          observations: ['Loaded data'],
        }),
      ];
      mockFS.promises.readFile.mockResolvedValueOnce(testData.join('\n'));

      // Read through manager
      const graph = await manager.readGraph();
      expect(graph.entities).toHaveLength(1);
      expect(graph.entities[0].name).toBe('LoadTest');
    });
  });
});
