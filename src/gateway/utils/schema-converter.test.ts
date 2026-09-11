import { describe, it, expect } from 'bun:test';
import { coerceJsonStringValue, jsonSchemaToZod } from './schema-converter';
import { z } from 'zod';

/**
 * Minimal shape used to inspect `z.toJSONSchema()` output in these tests —
 * just the fields the assertions below actually read.
 */
interface JsonSchemaOutput {
  items?: unknown;
  properties?: Record<string, { type?: string }>;
}

describe('jsonSchemaToZod', () => {
  it('should convert basic string schema', () => {
    const jsonSchema = {
      type: 'string',
      description: 'A test string',
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);
    expect(zodSchema).toBeInstanceOf(z.ZodType);

    // Test validation works
    expect(() => zodSchema.parse('test string')).not.toThrow();
    expect(() => zodSchema.parse(123)).toThrow();
  });

  it('should convert string schema with constraints', () => {
    const jsonSchema = {
      type: 'string',
      minLength: 3,
      maxLength: 10,
      pattern: '^[a-z]+$',
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    // Should pass validation
    expect(() => zodSchema.parse('abc')).not.toThrow();
    expect(() => zodSchema.parse('abcdefghij')).not.toThrow();

    // Should fail validation
    expect(() => zodSchema.parse('ab')).toThrow(); // Too short
    expect(() => zodSchema.parse('abcdefghijk')).toThrow(); // Too long
    expect(() => zodSchema.parse('ABC')).toThrow(); // Pattern mismatch
  });

  it('should convert number schema with constraints', () => {
    const jsonSchema = {
      type: 'number',
      minimum: 1,
      maximum: 100,
      description: 'A number between 1 and 100',
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    // Should pass validation
    expect(() => zodSchema.parse(1)).not.toThrow();
    expect(() => zodSchema.parse(50)).not.toThrow();
    expect(() => zodSchema.parse(100)).not.toThrow();

    // Should fail validation
    expect(() => zodSchema.parse(0)).toThrow(); // Too small
    expect(() => zodSchema.parse(101)).toThrow(); // Too large
    expect(() => zodSchema.parse('50')).toThrow(); // Wrong type
  });

  it('should convert integer schema', () => {
    const jsonSchema = {
      type: 'integer',
      minimum: 1,
      maximum: 100,
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    // Should pass validation
    expect(() => zodSchema.parse(1)).not.toThrow();
    expect(() => zodSchema.parse(100)).not.toThrow();

    // Should fail validation
    expect(() => zodSchema.parse(1.5)).toThrow(); // Not an integer
  });

  it('should convert enum schema', () => {
    const jsonSchema = {
      type: 'string',
      enum: ['one', 'two', 'three'],
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    // Should pass validation
    expect(() => zodSchema.parse('one')).not.toThrow();
    expect(() => zodSchema.parse('two')).not.toThrow();
    expect(() => zodSchema.parse('three')).not.toThrow();

    // Should fail validation
    expect(() => zodSchema.parse('four')).toThrow(); // Not in enum
  });

  it('should convert object schema with required properties', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer', minimum: 0 },
        email: { type: 'string', format: 'email' },
      },
      required: ['name', 'age'],
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    // Should pass validation with required fields
    expect(() =>
      zodSchema.parse({
        name: 'John',
        age: 30,
      }),
    ).not.toThrow();

    expect(() =>
      zodSchema.parse({
        name: 'John',
        age: 30,
        email: 'john@example.com',
      }),
    ).not.toThrow();

    // Should fail validation when required fields are missing
    expect(() =>
      zodSchema.parse({
        name: 'John',
      }),
    ).toThrow(); // Missing required age

    expect(() =>
      zodSchema.parse({
        age: 30,
      }),
    ).toThrow(); // Missing required name
  });

  it('should convert array schema', () => {
    const jsonSchema = {
      type: 'array',
      items: {
        type: 'string',
      },
      minItems: 1,
      maxItems: 3,
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    // Should pass validation
    expect(() => zodSchema.parse(['one'])).not.toThrow();
    expect(() => zodSchema.parse(['one', 'two', 'three'])).not.toThrow();

    // Should fail validation
    expect(() => zodSchema.parse([])).toThrow(); // Too few items
    expect(() => zodSchema.parse(['one', 'two', 'three', 'four'])).toThrow(); // Too many items
    expect(() => zodSchema.parse(['one', 2, 'three'])).toThrow(); // Wrong item type
  });

  it('should preserve empty array items schema', () => {
    const jsonSchema = {
      type: 'array',
      items: {},
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    // Convert back to JSON Schema
    const resultJsonSchema = z.toJSONSchema(zodSchema) as JsonSchemaOutput;
    // The items property should be present in the result
    expect(resultJsonSchema).toHaveProperty('items');
    expect(resultJsonSchema.items).toEqual({});

    // Should pass validation for any array items
    expect(() => zodSchema.parse(['string', 123, true, null])).not.toThrow();
    expect(() => zodSchema.parse([])).not.toThrow();
  });

  it('should handle complex nested schema', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        settings: {
          type: 'object',
          properties: {
            active: { type: 'boolean' },
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  value: { type: 'number' },
                },
                required: ['id'],
              },
            },
          },
        },
      },
      required: ['name'],
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    // Should pass validation for complex schema
    expect(() =>
      zodSchema.parse({
        name: 'Test',
        settings: {
          active: true,
          options: [{ id: 'opt1', value: 42 }, { id: 'opt2' }],
        },
      }),
    ).not.toThrow();

    // Should fail validation when nested required fields are missing
    expect(() =>
      zodSchema.parse({
        name: 'Test',
        settings: {
          active: true,
          options: [
            { value: 42 }, // Missing required id
          ],
        },
      }),
    ).toThrow();
  });

  it('should handle invalid schema gracefully', () => {
    // Should not throw for various invalid inputs
    expect(() => jsonSchemaToZod(null)).not.toThrow();
    expect(() => jsonSchemaToZod(undefined)).not.toThrow();
    expect(() => jsonSchemaToZod('not an object')).not.toThrow();
    expect(() => jsonSchemaToZod({})).not.toThrow();
  });

  // ---------------------------------------------------------------
  // PagerDuty real-world schemas
  // Captured from https://mcp.pagerduty.com/mcp (v1.20.0).
  // These test $ref resolution + anyOf nullable patterns that
  // previously caused Claude.ai to serialize query_model as a
  // JSON string instead of an object.
  // ---------------------------------------------------------------

  it('should resolve $ref — PagerDuty list_oncalls schema', () => {
    // Real schema from PagerDuty list_oncalls tool (trimmed to 3 properties)
    const jsonSchema = {
      $defs: {
        OncallQuery: {
          properties: {
            schedule_ids: {
              anyOf: [{ items: { type: 'string' }, type: 'array' }, { type: 'null' }],
              default: null,
              description: 'Filter by schedule IDs',
            },
            earliest: {
              anyOf: [{ type: 'boolean' }, { type: 'null' }],
              default: true,
              description:
                'Return only the earliest oncall for each combination of user and escalation policy',
            },
            limit: {
              anyOf: [{ maximum: 100, minimum: 1, type: 'integer' }, { type: 'null' }],
              default: 20,
              description: 'Pagination limit',
            },
          },
          type: 'object',
        },
      },
      properties: {
        query_model: { $ref: '#/$defs/OncallQuery' },
      },
      required: ['query_model'],
      type: 'object',
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    // Should accept a valid oncall query object
    expect(() =>
      zodSchema.parse({ query_model: { schedule_ids: ['PSCHED1'], limit: 10 } }),
    ).not.toThrow();

    // Should accept query_model with null fields (they have defaults)
    expect(() =>
      zodSchema.parse({ query_model: { schedule_ids: null, earliest: null } }),
    ).not.toThrow();

    // Should reject a string — this was the original bug
    expect(() => zodSchema.parse({ query_model: '{"query":"ICO"}' })).toThrow();

    // The output JSON Schema must advertise type: "object" for query_model
    const resultJsonSchema = z.toJSONSchema(zodSchema) as JsonSchemaOutput;
    expect(resultJsonSchema.properties?.query_model.type).toBe('object');
  });

  it('should resolve nullable $ref — PagerDuty get_incident schema', () => {
    // Real schema from PagerDuty get_incident tool
    // query_model is optional (anyOf with $ref + null, default: null)
    const jsonSchema = {
      $defs: {
        GetIncidentQuery: {
          description: 'Query model for retrieving a specific incident with optional parameters.',
          properties: {
            include: {
              anyOf: [{ items: { type: 'string' }, type: 'array' }, { type: 'null' }],
              default: null,
              description: 'List of additional information to include in the response.',
            },
          },
          type: 'object',
        },
      },
      properties: {
        incident_id: { type: 'string' },
        query_model: {
          anyOf: [{ $ref: '#/$defs/GetIncidentQuery' }, { type: 'null' }],
          default: null,
        },
      },
      required: ['incident_id'],
      type: 'object',
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    // Should accept with query_model as object
    expect(() =>
      zodSchema.parse({
        incident_id: 'P123ABC',
        query_model: { include: ['services', 'teams'] },
      }),
    ).not.toThrow();

    // Should accept with query_model as null (nullable)
    expect(() => zodSchema.parse({ incident_id: 'P123ABC', query_model: null })).not.toThrow();

    // Should accept without query_model (optional, not in required)
    expect(() => zodSchema.parse({ incident_id: 'P123ABC' })).not.toThrow();

    // incident_id is required
    expect(() => zodSchema.parse({ query_model: null })).toThrow();
  });

  it('should resolve $ref with enum arrays — PagerDuty list_incidents schema', () => {
    // Real schema from PagerDuty list_incidents tool (trimmed)
    const jsonSchema = {
      $defs: {
        IncidentQuery: {
          properties: {
            status: {
              anyOf: [
                {
                  items: {
                    enum: ['triggered', 'acknowledged', 'resolved'],
                    type: 'string',
                  },
                  type: 'array',
                },
                { type: 'null' },
              ],
              default: null,
              description: 'filter incidents by status',
            },
            urgencies: {
              anyOf: [
                {
                  items: { enum: ['high', 'low'], type: 'string' },
                  type: 'array',
                },
                { type: 'null' },
              ],
              default: null,
              description: 'Filter incidents by urgency',
            },
            limit: {
              anyOf: [{ maximum: 1000, minimum: 1, type: 'integer' }, { type: 'null' }],
              default: 1000,
              description: 'Maximum number of results to return',
            },
          },
          type: 'object',
        },
      },
      properties: {
        query_model: { $ref: '#/$defs/IncidentQuery' },
      },
      required: ['query_model'],
      type: 'object',
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    // Should accept valid enum values
    expect(() =>
      zodSchema.parse({
        query_model: {
          status: ['triggered', 'acknowledged'],
          urgencies: ['high'],
          limit: 50,
        },
      }),
    ).not.toThrow();

    // Should reject invalid enum values
    expect(() =>
      zodSchema.parse({
        query_model: { status: ['invalid_status'] },
      }),
    ).toThrow();

    // Should accept null for nullable fields
    expect(() => zodSchema.parse({ query_model: { status: null, urgencies: null } })).not.toThrow();
  });

  it('should convert property with properties but no type as object', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        query_model: {
          properties: {
            query: { type: 'string' },
          },
          required: ['query'],
        },
      },
      required: ['query_model'],
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    // Should accept a properly structured object
    expect(() => zodSchema.parse({ query_model: { query: 'ICO' } })).not.toThrow();

    // Should reject when nested required field is missing
    expect(() => zodSchema.parse({ query_model: {} })).toThrow();

    // The generated JSON Schema should advertise type: "object" for query_model
    const resultJsonSchema = z.toJSONSchema(zodSchema) as JsonSchemaOutput;
    expect(resultJsonSchema.properties?.query_model.type).toBe('object');
  });

  it('should handle empty top-level schema gracefully', () => {
    const zodSchema = jsonSchemaToZod({});
    // Should accept any value without throwing
    expect(() => zodSchema.parse({ foo: 'bar' })).not.toThrow();
    expect(() => zodSchema.parse('a string')).not.toThrow();
  });

  // ---------------------------------------------------------------
  // Edge case tests for $ref resolution, null/array-type, circular refs
  // ---------------------------------------------------------------

  it('should handle circular $ref without infinite recursion', () => {
    const jsonSchema = {
      $defs: {
        TreeNode: {
          type: 'object',
          properties: {
            value: { type: 'string' },
            children: {
              type: 'array',
              items: { $ref: '#/$defs/TreeNode' },
            },
          },
        },
      },
      properties: {
        root: { $ref: '#/$defs/TreeNode' },
      },
      required: ['root'],
      type: 'object',
    };

    // Should not throw (no infinite recursion)
    const zodSchema = jsonSchemaToZod(jsonSchema);
    // Should accept a valid tree node (depth 1)
    expect(() => zodSchema.parse({ root: { value: 'hello' } })).not.toThrow();
  });

  it('should handle unresolvable $ref gracefully', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        data: { $ref: '#/$defs/NonExistent' },
      },
      required: ['data'],
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);
    // Fallback to permissive record — should accept any object
    expect(() => zodSchema.parse({ data: { anything: true } })).not.toThrow();
  });

  it('should handle $ref with invalid format', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        data: { $ref: 'not-a-valid-ref' },
      },
    };

    // Should not throw
    const zodSchema = jsonSchemaToZod(jsonSchema);
    expect(() => zodSchema.parse({ data: { foo: 'bar' } })).not.toThrow();
  });

  it('should handle standalone { type: "null" }', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        deletedAt: { type: 'null' },
      },
      required: ['deletedAt'],
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    // Should accept null
    expect(() => zodSchema.parse({ deletedAt: null })).not.toThrow();
    // Should reject non-null
    expect(() => zodSchema.parse({ deletedAt: 'something' })).toThrow();
  });

  it('should handle array-form type ["string", "null"] (JSON Schema Draft 4/6/7)', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        name: { type: ['string', 'null'] },
      },
      required: ['name'],
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    // Should accept string
    expect(() => zodSchema.parse({ name: 'hello' })).not.toThrow();
    // Should accept null
    expect(() => zodSchema.parse({ name: null })).not.toThrow();
    // Should reject number
    expect(() => zodSchema.parse({ name: 42 })).toThrow();
  });

  it('should handle oneOf the same as anyOf', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        value: {
          oneOf: [{ type: 'string' }, { type: 'null' }],
        },
      },
      required: ['value'],
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);
    expect(() => zodSchema.parse({ value: 'hello' })).not.toThrow();
    expect(() => zodSchema.parse({ value: null })).not.toThrow();
    expect(() => zodSchema.parse({ value: 42 })).toThrow();
  });

  it('should handle anyOf with 3+ variants', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        flexible: {
          anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }],
        },
      },
      required: ['flexible'],
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);
    expect(() => zodSchema.parse({ flexible: 'hello' })).not.toThrow();
    expect(() => zodSchema.parse({ flexible: 42 })).not.toThrow();
    expect(() => zodSchema.parse({ flexible: null })).not.toThrow();
    expect(() => zodSchema.parse({ flexible: true })).toThrow();
  });

  it('should handle single-variant anyOf as passthrough', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        name: {
          anyOf: [{ type: 'string' }],
        },
      },
      required: ['name'],
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);
    expect(() => zodSchema.parse({ name: 'hello' })).not.toThrow();
    expect(() => zodSchema.parse({ name: 42 })).toThrow();
  });

  it('should handle empty anyOf gracefully', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        data: { anyOf: [] },
      },
      required: ['data'],
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);
    // Falls back to z.unknown() — should accept anything
    expect(() => zodSchema.parse({ data: 'anything' })).not.toThrow();
    expect(() => zodSchema.parse({ data: 42 })).not.toThrow();
  });

  it('should handle $ref through non-object path segment gracefully', () => {
    const jsonSchema = {
      type: 'object',
      $defs: {
        outer: 'a string not an object',
      },
      properties: {
        data: { $ref: '#/$defs/outer/inner' },
      },
      required: ['data'],
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);
    // Fallback to permissive record — should accept any object
    expect(() => zodSchema.parse({ data: { anything: true } })).not.toThrow();
  });

  it('should handle allOf gracefully with a warning fallback', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        config: {
          allOf: [
            { type: 'object', properties: { name: { type: 'string' } } },
            { type: 'object', properties: { age: { type: 'number' } } },
          ],
        },
      },
      required: ['config'],
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);
    // allOf is unsupported — falls back to permissive record
    expect(() => zodSchema.parse({ config: { name: 'Alice', age: 30 } })).not.toThrow();
    expect(() => zodSchema.parse({ config: { anything: true } })).not.toThrow();
  });

  it('should handle $ref resolving to a non-object value gracefully', () => {
    const jsonSchema = {
      type: 'object',
      $defs: {
        BadDef: 'this is a string, not a schema object',
      },
      properties: {
        data: { $ref: '#/$defs/BadDef' },
      },
      required: ['data'],
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);
    // Should fall back to permissive record since ref resolved to non-object
    expect(() => zodSchema.parse({ data: { anything: true } })).not.toThrow();
  });

  it('should detect nullable pattern when null variant is a $ref', () => {
    const jsonSchema = {
      type: 'object',
      $defs: {
        NullType: { type: 'null' },
        MyObject: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
      },
      properties: {
        data: {
          anyOf: [{ $ref: '#/$defs/MyObject' }, { $ref: '#/$defs/NullType' }],
        },
      },
      required: ['data'],
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);
    // Should accept object
    expect(() => zodSchema.parse({ data: { name: 'hello' } })).not.toThrow();
    // Should accept null (nullable)
    expect(() => zodSchema.parse({ data: null })).not.toThrow();
    // Should reject number
    expect(() => zodSchema.parse({ data: 42 })).toThrow();
  });

  it('should convert a real example from the confluence tool schema', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        spaceKey: {
          type: 'string',
          description:
            'The key of the Confluence space to retrieve (e.g., "DEV" or "MARKETING"). The space key is a unique identifier for a space, typically a short uppercase code.',
        },
      },
      required: ['spaceKey'],
      additionalProperties: false,
      $schema: 'http://json-schema.org/draft-07/schema#',
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    // Should pass validation with required spaceKey
    expect(() =>
      zodSchema.parse({
        spaceKey: 'DEV',
      }),
    ).not.toThrow();

    // Should fail validation when spaceKey is missing
    expect(() => zodSchema.parse({})).toThrow();

    // Should fail validation when spaceKey is wrong type
    expect(() =>
      zodSchema.parse({
        spaceKey: 123,
      }),
    ).toThrow();

    // Should fail validation when additional properties are included
    // (since additionalProperties is false)
    expect(() =>
      zodSchema.parse({
        spaceKey: 'DEV',
        extraProp: 'should not be allowed',
      }),
    ).toThrow();
  });

  it('should allow additional properties when additionalProperties is empty object', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        url: { type: 'string' },
        listTitle: { type: 'string' },
        itemData: {
          type: 'object',
          additionalProperties: {},
          description: 'Key-value pairs of field names and their values',
        },
      },
      required: ['url', 'listTitle', 'itemData'],
      additionalProperties: false,
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    // Root should reject extra props (additionalProperties: false)
    expect(() =>
      zodSchema.parse({
        url: 'https://example.com',
        listTitle: 'Tasks',
        itemData: {},
        extra: 'nope',
      }),
    ).toThrow();

    // itemData should accept arbitrary keys (additionalProperties: {})
    expect(() =>
      zodSchema.parse({
        url: 'https://example.com',
        listTitle: 'Tasks',
        itemData: { Title: 'My Item', Status: 'Active', Priority: 'High' },
      }),
    ).not.toThrow();
  });

  it('should allow additional properties when additionalProperties is not specified', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      required: ['name'],
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    // Should accept extra properties (JSON Schema default allows them)
    expect(() => zodSchema.parse({ name: 'test', extra: 'allowed' })).not.toThrow();
  });

  it('should allow additional properties when additionalProperties is true', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      required: ['name'],
      additionalProperties: true,
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    expect(() => zodSchema.parse({ name: 'test', extra: 'allowed' })).not.toThrow();
  });

  it('should convert record/map schema (object with additionalProperties but no properties)', () => {
    const jsonSchema = {
      type: 'object',
      additionalProperties: {
        anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'null' }],
      },
      propertyNames: { type: 'string' },
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    expect(() => zodSchema.parse({ c_Headline: 'test', c_Priority: 1 })).not.toThrow();
    expect(() => zodSchema.parse({ flag: true, cleared: null })).not.toThrow();
    expect(() => zodSchema.parse({})).not.toThrow();
  });

  it('should convert record schema with simple additionalProperties type', () => {
    const jsonSchema = {
      type: 'object',
      additionalProperties: { type: 'string' },
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    expect(() => zodSchema.parse({ key1: 'val1', key2: 'val2' })).not.toThrow();
  });

  it('should convert bare object (no properties, no additionalProperties) to record', () => {
    const jsonSchema = {
      type: 'object',
    };

    const zodSchema = jsonSchemaToZod(jsonSchema);

    expect(() => zodSchema.parse({ anything: 'goes' })).not.toThrow();
  });
});

describe('coerceJsonStringValue', () => {
  it('parses a JSON object string into an object', () => {
    expect(coerceJsonStringValue('{"query":"ICO"}')).toEqual({ query: 'ICO' });
  });

  it('parses a JSON array string into an array', () => {
    expect(coerceJsonStringValue('["a","b","c"]')).toEqual(['a', 'b', 'c']);
  });

  it('parses "{}" / "[]" into empty object/array', () => {
    expect(coerceJsonStringValue('{}')).toEqual({});
    expect(coerceJsonStringValue('[]')).toEqual([]);
  });

  it('leaves plain strings untouched', () => {
    expect(coerceJsonStringValue('hello world')).toBe('hello world');
  });

  it('keeps the original string when JSON parsing fails', () => {
    expect(coerceJsonStringValue('{not json}')).toBe('{not json}');
  });

  it('does not coerce short strings like single braces', () => {
    expect(coerceJsonStringValue('{')).toBe('{');
    expect(coerceJsonStringValue('}')).toBe('}');
  });

  it('passes non-string values through unchanged', () => {
    const obj = { a: 1 };
    expect(coerceJsonStringValue(obj)).toBe(obj);
    expect(coerceJsonStringValue(42)).toBe(42);
    expect(coerceJsonStringValue(true)).toBe(true);
    expect(coerceJsonStringValue(null)).toBeNull();
    expect(coerceJsonStringValue(undefined)).toBeUndefined();
  });
});

describe('jsonSchemaToZod with coerceTopLevelJsonStrings (remote-tool path)', () => {
  // Mirrors the PagerDuty query_model shape from issue #1263: an object-typed
  // top-level param a client may serialize as a JSON string.
  const queryModelSchema = {
    type: 'object',
    properties: {
      query_model: {
        type: 'object',
        description: 'The query model',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
      ids: { type: 'array', items: { type: 'string' } },
      note: { type: 'string', description: 'A note' },
    },
    required: ['query_model'],
  };

  it('coerces a stringified object param so it validates against the object schema', () => {
    const zodSchema = jsonSchemaToZod(queryModelSchema, {
      coerceTopLevelJsonStrings: true,
    });

    const parsed = zodSchema.parse({ query_model: '{"query":"ICO"}' }) as Record<
      string,
      unknown
    >;
    expect(parsed.query_model).toEqual({ query: 'ICO' });
  });

  it('coerces a stringified array param', () => {
    const zodSchema = jsonSchemaToZod(queryModelSchema, {
      coerceTopLevelJsonStrings: true,
    });

    const parsed = zodSchema.parse({
      query_model: { query: 'ICO' },
      ids: '["a","b","c"]',
    }) as Record<string, unknown>;
    expect(parsed.ids).toEqual(['a', 'b', 'c']);
  });

  it('still accepts a genuine object param (no regression)', () => {
    const zodSchema = jsonSchemaToZod(queryModelSchema, {
      coerceTopLevelJsonStrings: true,
    });

    const parsed = zodSchema.parse({ query_model: { query: 'ICO' } }) as Record<string, unknown>;
    expect(parsed.query_model).toEqual({ query: 'ICO' });
  });

  it('does NOT coerce a param explicitly typed "string" even if it looks like JSON', () => {
    const zodSchema = jsonSchemaToZod(queryModelSchema, {
      coerceTopLevelJsonStrings: true,
    });

    const parsed = zodSchema.parse({
      query_model: { query: 'ICO' },
      note: '{"looks":"like json"}',
    }) as Record<string, unknown>;
    // Left as a raw string because the schema declares note as type "string"
    expect(parsed.note).toBe('{"looks":"like json"}');
  });

  it('only coerces top-level params, not nested JSON strings', () => {
    const schema = {
      type: 'object',
      properties: {
        outer: {
          type: 'object',
          properties: { inner: { type: 'string' } },
        },
      },
    };
    const zodSchema = jsonSchemaToZod(schema, {
      coerceTopLevelJsonStrings: true,
    });

    const parsed = zodSchema.parse({
      outer: { inner: '{"key":"val"}' },
    }) as { outer: { inner: unknown } };
    // Nested string is untouched — only top-level values are coerced
    expect(parsed.outer.inner).toBe('{"key":"val"}');
  });

  it('rejects a stringified object when coercion is OFF (default / local + bundled path unchanged)', () => {
    const zodSchema = jsonSchemaToZod(queryModelSchema);
    // Without the remote-only option, a stringified object still fails validation
    // exactly as before — proving native/local/bundled tools are unaffected.
    expect(() => zodSchema.parse({ query_model: '{"query":"ICO"}' })).toThrow();
    // ...and a genuine object still validates.
    expect(() => zodSchema.parse({ query_model: { query: 'ICO' } })).not.toThrow();
  });
});
