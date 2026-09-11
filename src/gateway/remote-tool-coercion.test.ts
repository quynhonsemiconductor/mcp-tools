/**
 * remote-tool-coercion.test.ts - Coverage for issue #1263
 *
 * Verifies that the Zod schema produced by createRemoteToolConfig (the schema
 * tool-registry.ts registers as a remote tool's `inputSchema`):
 *
 *   1. coerces stringified object/array arguments into their parsed form BEFORE
 *      validation, so a client (Claude.ai / Claude Code) that serializes an object
 *      arg as a JSON string is accepted instead of rejected with
 *      `-32602 … expected object, received string`;
 *   2. does NOT coerce params that can accept a string (so a legitimate
 *      JSON-looking string is left intact instead of parsed-then-rejected);
 *   3. on a malformed JSON string, surfaces a targeted error ONLY for explicit
 *      object/array container params (where `main` already rejected the value);
 *      untyped params — which accept any string on `main` — stay lenient and pass
 *      the string through rather than gaining a new hard rejection; and
 *   4. still advertises the real object schema via `tools/list` (the per-property
 *      preprocess wrapper does NOT collapse the object to an empty schema).
 *
 * (This path does NOT fix issue #1256 — a native `additionalFields` map is a
 * `z.record(...)` declared directly in Zod and never passes through
 * jsonSchemaToZod. See remote-mcp-client.test.ts for the handler-side coercion.)
 *
 * The MCP SDK (v1.26) validates incoming args with `safeParseAsync(schema, args)`
 * and advertises via `z.toJSONSchema(schema, { io: 'input' })` — verified against
 * a live McpServer + Client over an in-memory transport during development. We
 * assert those exact operations directly against the registered schema here
 * rather than spinning up a live server: sibling gateway/tool tests globally mock
 * the SDK client/server modules (Bun's mock.module leaks across files — e.g.
 * src/commands/server.test.ts mocks the SDK server module), which makes a
 * live-server test hang/fail vacuously in the full suite. Driving the schema
 * directly is both faithful to the SDK and robust — it depends only on zod,
 * which is never mocked.
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { z } from 'zod';
import { setupStandardMocks } from '../test-utils/mocks';

import { createRemoteToolConfig, type RemoteMCPTool } from './remote-mcp-client';
import { jsonSchemaToZod, type JsonSchema } from './utils/schema-converter';

// Minimal shape assertions below need from z.toJSONSchema()'s return value.
// zod's own JSONSchema.BaseSchema type models the full spec generically
// (deeply optional, keyed by unknown extensions), which makes chained
// property access on it awkward for a handful of fixed assertions — this
// narrows to just what this suite reads.
interface QueryModelJsonSchema {
  properties: {
    query_model: {
      type: string;
      description?: string;
      properties: { query: { type: string } };
    };
    ids: { type: string };
    note: { type: string };
  };
  required?: string[];
}

describe('remote tool stringified-param coercion (issue #1256/#1263)', () => {
  setupStandardMocks();

  // PagerDuty query_model-style tool: an object-typed param, an array param, and
  // a genuinely string-typed param.
  const remoteTool: RemoteMCPTool = {
    name: 'query_model',
    description: 'Run a query model',
    serverId: 'pagerduty',
    serverName: 'PagerDuty',
    annotations: {},
    parameters: {
      type: 'object',
      properties: {
        query_model: {
          type: 'object',
          description: 'The query model object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
        ids: { type: 'array', items: { type: 'string' } },
        note: { type: 'string', description: 'A freeform note' },
      },
      required: ['query_model'],
    },
  };

  let schema: z.ZodType;

  beforeEach(() => {
    // The schema tool-registry.ts registers as this remote tool's inputSchema.
    schema = createRemoteToolConfig(remoteTool).parameters;
  });

  describe('tools/list advertisement (no schema regression)', () => {
    it('registers as an object schema whose shape exposes every param', () => {
      // The MCP SDK only advertises a schema whose top level normalizes to an
      // object (ZodObject with a shape); a top-level z.preprocess() wrapper would
      // collapse the advertised schema to `{}`. Assert the top level stayed an
      // object with all properties.
      expect(schema).toBeInstanceOf(z.ZodObject);
      expect(Object.keys((schema as z.ZodObject).shape)).toEqual(['query_model', 'ids', 'note']);
    });

    it('advertises full property types + descriptions via z.toJSONSchema (input io)', () => {
      // The SDK advertises via its own `toJsonSchemaCompat(obj, { strictUnions:
      // true, pipeStrategy: 'input' })` (server/mcp.js). That helper is internal
      // (not re-exported from `@modelcontextprotocol/sdk/server`, and the package
      // `exports` map blocks the deep path), so we assert through the public
      // `z.toJSONSchema(schema, { io: 'input' })` — verified to produce identical
      // output on zod 4.3.5, and `io: 'input'` mirrors `pipeStrategy: 'input'`,
      // the branch that matters for the per-property preprocess wrappers.
      const json = z.toJSONSchema(schema, { io: 'input' }) as unknown as QueryModelJsonSchema;
      expect(json.properties.query_model.type).toBe('object');
      expect(json.properties.query_model.properties.query.type).toBe('string');
      expect(json.properties.query_model.description).toBe('The query model object');
      expect(json.properties.ids.type).toBe('array');
      expect(json.properties.note.type).toBe('string');
      expect(json.required).toContain('query_model');
    });
  });

  describe('coercion before validation', () => {
    it('accepts a stringified object arg and parses it to an object', () => {
      const parsed = schema.parse({ query_model: '{"query":"ICO"}' }) as Record<string, unknown>;
      expect(parsed.query_model).toEqual({ query: 'ICO' });
    });

    it('accepts a stringified array arg and parses it to an array', () => {
      const parsed = schema.parse({
        query_model: { query: 'ICO' },
        ids: '["a","b","c"]',
      }) as Record<string, unknown>;
      expect(parsed.ids).toEqual(['a', 'b', 'c']);
    });

    it('still accepts a genuine object arg (no regression)', () => {
      const parsed = schema.parse({ query_model: { query: 'ICO' } }) as Record<string, unknown>;
      expect(parsed.query_model).toEqual({ query: 'ICO' });
    });

    it('does NOT coerce a param explicitly typed "string" that looks like JSON', () => {
      const parsed = schema.parse({
        query_model: { query: 'ICO' },
        note: '{"looks":"like json"}',
      }) as Record<string, unknown>;
      expect(parsed.note).toBe('{"looks":"like json"}');
    });

    it('surfaces a targeted error (not a type error) for malformed JSON on an object param', () => {
      const result = schema.safeParse({
        query_model: '{"query":"ICO",}', // trailing comma — invalid JSON
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues[0];
        expect(issue.message).toContain('not valid JSON');
        expect(issue.path).toEqual(['query_model']);
      }
    });
  });

  describe('string-accepting params are not coerced (regression: calls that work on main)', () => {
    // Every spelling of "this param can be a string". A JSON-looking string is a
    // legitimate value for these; coercing it into an object then rejecting it
    // would break calls that succeed without the coercion option.
    const stringAcceptingShapes: Record<string, JsonSchema> = {
      'anyOf[string,null] (Pydantic Optional[str])': {
        anyOf: [{ type: 'string' }, { type: 'null' }],
      },
      'type:[string,null]': { type: ['string', 'null'] },
      '$ref to a string def': { $ref: '#/$defs/StrDef' },
      'string|object union': {
        anyOf: [{ type: 'object' }, { type: 'string' }],
      },
    };

    for (const [label, propSchema] of Object.entries(stringAcceptingShapes)) {
      it(`leaves a JSON-looking string intact for: ${label}`, () => {
        const tool: RemoteMCPTool = {
          name: 't',
          description: 'd',
          serverId: 's',
          serverName: 'S',
          annotations: {},
          parameters: {
            type: 'object',
            properties: { p: propSchema },
            $defs: { StrDef: { type: 'string' } },
          },
        };
        const s = createRemoteToolConfig(tool).parameters;
        const parsed = s.parse({ p: '{"a":1}' }) as Record<string, unknown>;
        expect(parsed.p).toBe('{"a":1}');
      });
    }
  });

  // Build a single-param remote tool schema for the property shape under test.
  const schemaForProp = (propSchema: JsonSchema): z.ZodType => {
    const tool: RemoteMCPTool = {
      name: 't',
      description: 'd',
      serverId: 's',
      serverName: 'S',
      annotations: {},
      parameters: { type: 'object', properties: { q: propSchema } },
    };
    return createRemoteToolConfig(tool).parameters;
  };

  describe('untyped param (the #1263 shape) is still coerced', () => {
    const untyped = { description: 'untyped, surfaced as {}' };

    it('parses a stringified object for an untyped param', () => {
      const parsed = schemaForProp(untyped).parse({ q: '{"query":"ICO"}' }) as Record<string, unknown>;
      expect(parsed.q).toEqual({ query: 'ICO' });
    });

    // An untyped param accepts any string on `main`, so a JSON-looking string
    // that fails to parse must NOT become a hard rejection — it stays lenient
    // and passes through unparsed (ctx is withheld for non-container params).
    const passThroughValues: Record<string, string> = {
      "Python-style dict {'a': 1}": "{'a': 1}",
      'jq filter {name: .name}': '{name: .name}',
      'template string {{user}} owns {{repo}}': '{{user}} owns {{repo}}',
      'label selector {job="api",env="prod"}': '{job="api",env="prod"}',
      'trailing-comma JSON {"a":1,}': '{"a":1,}',
    };
    for (const [label, value] of Object.entries(passThroughValues)) {
      it(`leaves a malformed JSON-looking string intact for an untyped param: ${label}`, () => {
        const parsed = schemaForProp(untyped).parse({ q: value }) as Record<string, unknown>;
        expect(parsed.q).toBe(value);
      });
    }

    it('still surfaces a plain (non-JSON-looking) string on an untyped param', () => {
      const parsed = schemaForProp(untyped).parse({ q: 'hello world' }) as Record<string, unknown>;
      expect(parsed.q).toBe('hello world');
    });
  });

  describe('malformed JSON only hard-fails for explicit container params', () => {
    it('hard-fails with a targeted error for an explicit object param', () => {
      const result = schemaForProp({ type: 'object' }).safeParse({
        q: '{"a":1,}',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('not valid JSON');
        expect(result.error.issues[0]?.path).toEqual(['q']);
      }
    });

    it('hard-fails for an explicit array param', () => {
      const result = schemaForProp({
        type: 'array',
        items: { type: 'string' },
      }).safeParse({ q: '[bad,]' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('not valid JSON');
      }
    });

    it('hard-fails for a nullable object (anyOf[object,null]) param', () => {
      const result = schemaForProp({
        anyOf: [{ type: 'object' }, { type: 'null' }],
      }).safeParse({ q: '{"a":1,}' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('not valid JSON');
      }
    });

    it('reports the native type error (not the JSON message) for a non-container param handed malformed JSON', () => {
      // A number param is neither string-accepting nor an explicit container, so
      // it coerces leniently: the malformed string passes through and the inner
      // z.number() rejects it as the wrong type — not a misleading "fix the JSON".
      const result = schemaForProp({ type: 'number' }).safeParse({
        q: '{bad}',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).not.toContain('not valid JSON');
      }
    });
  });

  it('reproduces the pre-fix failure: a non-coercing schema rejects the stringified object', () => {
    // The SAME tool schema built WITHOUT the coercion option — what a native/local
    // tool (or the pre-fix remote path) produces. Validation rejects the
    // stringified object exactly as it does today, while the fixed schema accepts
    // it. This also demonstrates native/local/bundled tools are unaffected.
    const plainSchema = jsonSchemaToZod(remoteTool.parameters);

    expect(() => plainSchema.parse({ query_model: '{"query":"ICO"}' })).toThrow();
    expect(() => plainSchema.parse({ query_model: { query: 'ICO' } })).not.toThrow();
    // ...and the fixed schema accepts the very input the plain one rejects.
    expect(() => schema.parse({ query_model: '{"query":"ICO"}' })).not.toThrow();
  });
});
