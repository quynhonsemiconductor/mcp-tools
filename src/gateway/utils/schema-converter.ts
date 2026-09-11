/**
 * schema-converter.ts - JSON Schema to Zod conversion utilities
 *
 * This module provides utilities for converting JSON Schema to Zod schemas,
 * particularly for remote and bundled MCP server tool schemas, including
 * $ref resolution for complex parameter types.
 */
import { z } from 'zod';
import { logDebug, logError, logWarn } from '../../services/logger';

/**
 * Options controlling how {@link jsonSchemaToZod} builds the Zod schema.
 */
export interface JsonSchemaToZodOptions {
  /**
   * When true, each top-level object property that is NOT explicitly typed as
   * `"string"` is wrapped in a `z.preprocess()` that parses JSON-encoded strings
   * (values that start/end with `{}`/`[]`) into objects/arrays BEFORE the schema
   * validates them.
   *
   * This exists for the remote MCP tool path: some clients (Claude.ai / Claude
   * Code) serialize object/array arguments as JSON strings. The MCP SDK validates
   * incoming args against the registered schema *before* the tool handler runs, so
   * without this the stringified value is rejected (`-32602 … expected object,
   * received string`) before any handler-side coercion can help.
   *
   * Only the direct properties of the root object are coerced — this mirrors the
   * historical top-level-only semantics of `coerceJsonStringParameters`. Wrapping
   * is per-property (not around the whole object) so the object shape is preserved
   * and the schema still advertises correctly via `tools/list`.
   */
  coerceTopLevelJsonStrings?: boolean;
}

/**
 * A JSON Schema node, as encountered throughout this module. Every field is
 * optional and loosely typed — real-world schemas from remote/bundled MCP
 * servers make no promises about shape or which draft they follow. This is
 * deliberately not a full JSON Schema spec type: just enough structure to
 * replace `any` at this module's boundaries so property access is checked,
 * while an index signature keeps unknown-but-legitimate keys (`$id`, `title`,
 * `$defs`, etc.) from tripping the type checker.
 */
export interface JsonSchema {
  type?: string | string[];
  $ref?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  enum?: unknown[];
  description?: string;
  default?: unknown;
  // string
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  // number
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  // array
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  // Anything else a real-world schema document may carry ($id, $defs, title,
  // examples, etc.) — kept as `unknown` so accessing it still forces a narrow
  // before use, rather than opening the door back up to `any`.
  [key: string]: unknown;
}

/**
 * True when `value` is a string that both begins and ends with `{}`/`[]`, i.e.
 * a plausible JSON-encoded object/array. Shared by {@link coerceJsonStringValue}
 * and `coerceJsonStringParameters` (remote-mcp-client) so both use identical
 * detection.
 */
export function looksLikeJsonContainer(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 2 &&
    ((value[0] === '{' && value[value.length - 1] === '}') ||
      (value[0] === '[' && value[value.length - 1] === ']'))
  );
}

/**
 * Reports whether a JSON Schema node can accept a string value. Used to decide
 * whether JSON-string coercion is safe: a param that legitimately accepts a
 * string must NOT be coerced, or a caller-supplied JSON-looking string is parsed
 * into an object and then rejected by the string branch.
 *
 * Recognises the string spellings the converter actually emits: literal
 * `type: "string"`, array `type: ["string", ...]`, `anyOf`/`oneOf` unions with a
 * string variant, `$ref` to a string definition, and untyped string enums.
 * `allOf` is not handled (the converter turns it into a record, so `main` already
 * rejects strings there — coercing only makes it more permissive, never less).
 */
export function acceptsString(
  propSchema: JsonSchema | null | undefined,
  rootSchema: JsonSchema,
  seen: Set<string> = new Set(),
): boolean {
  if (!propSchema || typeof propSchema !== 'object') return false;
  if (propSchema.$ref) {
    if (seen.has(propSchema.$ref)) return false;
    return acceptsString(
      resolveRef(propSchema.$ref, rootSchema),
      rootSchema,
      new Set(seen).add(propSchema.$ref),
    );
  }
  if (Array.isArray(propSchema.type)) return propSchema.type.includes('string');
  const variants = propSchema.anyOf || propSchema.oneOf;
  if (variants) return variants.some((v) => acceptsString(v, rootSchema, seen));
  if (propSchema.type === 'string') return true;
  if (!propSchema.type && Array.isArray(propSchema.enum))
    return propSchema.enum.some((v: unknown) => typeof v === 'string');
  return false;
}

/**
 * Reports whether a JSON Schema node explicitly declares an object/array
 * ("container") type — resolving `$ref`, array `type`, and `anyOf`/`oneOf`
 * unions the same way {@link acceptsString} does.
 *
 * Used to decide whether malformed-JSON coercion should hard-fail. An explicit
 * container already rejects a stringified value on `main`, so raising a targeted
 * "invalid JSON" issue there is a strict message upgrade. An untyped param, by
 * contrast, accepts any string on `main` (Python-style dicts, jq filters,
 * template strings, label selectors); hard-failing it would be a new failure
 * mode, so those stay lenient and pass a malformed string through unparsed.
 */
export function isExplicitContainer(
  propSchema: JsonSchema | null | undefined,
  rootSchema: JsonSchema,
  seen: Set<string> = new Set(),
): boolean {
  if (!propSchema || typeof propSchema !== 'object') return false;
  if (propSchema.$ref) {
    if (seen.has(propSchema.$ref)) return false;
    return isExplicitContainer(
      resolveRef(propSchema.$ref, rootSchema),
      rootSchema,
      new Set(seen).add(propSchema.$ref),
    );
  }
  if (Array.isArray(propSchema.type))
    return propSchema.type.some((t) => t === 'object' || t === 'array');
  const variants = propSchema.anyOf || propSchema.oneOf;
  if (variants) return variants.some((v) => isExplicitContainer(v, rootSchema, seen));
  return propSchema.type === 'object' || propSchema.type === 'array';
}

/**
 * Coerce a single value that is a JSON-encoded object/array string into its
 * parsed equivalent, used as the `z.preprocess` transform on the remote-tool
 * path. Only strings that begin and end with `{}`/`[]` are considered; any other
 * value is returned as-is.
 *
 * On a parse failure, behaviour depends on whether a `ctx` was supplied. With a
 * `ctx` (explicit container params only — see {@link isExplicitContainer}) a
 * targeted issue is added so the caller sees "this looks like JSON but is
 * malformed" rather than a generic `expected object, received string` type error
 * that reads as "wrong type" and sends models into a restructure-and-retry loop.
 * Without a `ctx` (untyped params, which accept any string on `main`) the
 * original value is returned unparsed so a non-JSON string is not turned into a
 * hard rejection it never was before. The raw parser error is logged only at
 * `debug` (excluded from telemetry) since it can echo argument content.
 *
 * Exported for use as the `z.preprocess` transform and for unit testing.
 */
export function coerceJsonStringValue(
  value: unknown,
  ctx?: z.core.$RefinementCtx,
  key?: string,
): unknown {
  if (looksLikeJsonContainer(value)) {
    const label = key ? `"${key}" ` : '';
    try {
      const parsed: unknown = JSON.parse(value);
      logDebug(`Coerced parameter ${label}from JSON string to ${typeof parsed} before validation`);
      return parsed;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logDebug(`Parameter ${label}looks like JSON but failed to parse: ${message}`);
      if (ctx) {
        ctx.addIssue({
          code: 'custom',
          message:
            `Parameter ${label}looks like a JSON-encoded object/array but is not valid JSON — ` +
            `fix the JSON syntax or pass a real object/array.`,
        });
        return z.NEVER;
      }
      return value;
    }
  }
  return value;
}

/**
 * Converts a JSON Schema to a Zod schema
 * @param schema JSON Schema object
 * @param options Conversion options (e.g. top-level JSON-string coercion for remote tools)
 * @returns Zod schema
 */
export function jsonSchemaToZod(schema: unknown, options: JsonSchemaToZodOptions = {}): z.ZodType {
  if (!schema || typeof schema !== 'object') {
    return z.any();
  }

  // From here on `schema` is a plain object; treat it as a JSON Schema node.
  // The shape isn't verified beyond that (arbitrary remote/bundled MCP server
  // input), which is why every field on JsonSchema is optional.
  const schemaNode = schema as JsonSchema;

  // Capture the root schema so we can resolve $ref references (e.g. "$ref": "#/$defs/Foo")
  // that appear in remote MCP server schemas like PagerDuty.
  const rootSchema = schemaNode;

  try {
    // Remote-tool path: build the root object so each top-level property parses
    // stringified JSON before validation. Only applies when the root is a plain
    // object with named properties; records/$refs/unions (incl. roots carrying
    // anyOf/oneOf/allOf alongside properties) fall through unchanged.
    if (
      options.coerceTopLevelJsonStrings &&
      !schemaNode.$ref &&
      !schemaNode.anyOf &&
      !schemaNode.oneOf &&
      !schemaNode.allOf &&
      (schemaNode.type === 'object' || (!schemaNode.type && schemaNode.properties)) &&
      schemaNode.properties &&
      typeof schemaNode.properties === 'object'
    ) {
      return convertObjectSchema(schemaNode, rootSchema, new Set(), true);
    }
    return convertSchemaNode(schemaNode, rootSchema);
  } catch (error) {
    logError(
      `Failed to convert JSON schema to Zod (falling back to permissive schema). ` +
        `Schema keys: ${Object.keys(schemaNode).join(', ')}. ` +
        `Schema preview: ${JSON.stringify(schemaNode).slice(0, 500)}`,
      error,
    );
    return z.unknown();
  }
}

/**
 * Core conversion dispatcher — handles $ref resolution, type detection, and
 * delegates to specialised converters.
 * @param schema The current JSON Schema node being converted
 * @param rootSchema The top-level schema, threaded through for $ref resolution
 * @param visitedRefs Tracks visited $ref paths to prevent infinite recursion on circular references
 */
function convertSchemaNode(
  schemaInput: unknown,
  rootSchema: JsonSchema,
  visitedRefs = new Set<string>(),
): z.ZodType {
  if (!schemaInput || typeof schemaInput !== 'object') {
    if (schemaInput !== null && schemaInput !== undefined) {
      logWarn(
        `convertSchemaNode received non-object schema value (${typeof schemaInput}) — falling back to z.any()`,
      );
    } else if (schemaInput === null || schemaInput === undefined) {
      logWarn(`convertSchemaNode received ${schemaInput} schema — falling back to z.any()`);
    }
    return z.any();
  }

  // Every sub-node handled below (properties, items, anyOf/oneOf variants,
  // resolved $refs) is either produced by this module or comes straight from
  // an external JSON Schema document, so the shape is asserted rather than
  // fully re-validated here.
  const schema = schemaInput as JsonSchema;

  // Resolve $ref first — remote MCP servers (e.g. PagerDuty) use
  // { "$ref": "#/$defs/SomeType" } for complex parameter types.
  if (schema.$ref) {
    if (visitedRefs.has(schema.$ref)) {
      logWarn(`Circular $ref detected: "${schema.$ref}" — breaking cycle with permissive schema`);
      return z.unknown();
    }
    const nextVisited = new Set(visitedRefs);
    nextVisited.add(schema.$ref);

    const resolved = resolveRef(schema.$ref, rootSchema);
    if (resolved) {
      return convertSchemaNode(resolved, rootSchema, nextVisited);
    }
    logWarn(`Unresolvable $ref "${schema.$ref}" — falling back to permissive record schema`);
    return z.record(z.string(), z.unknown());
  }

  // allOf (schema composition) is not yet supported — log so operators know
  if (schema.allOf) {
    logWarn(
      `Schema uses "allOf" which is not yet supported by the schema converter — falling back to permissive schema`,
    );
    return z.record(z.string(), z.unknown());
  }

  // Handle anyOf / oneOf (e.g. PagerDuty nullable refs: { anyOf: [{$ref: ...}, {type: "null"}] })
  const variants = schema.anyOf ?? schema.oneOf;
  if (variants) {
    if (variants.length === 0) {
      logWarn(`Schema has empty ${schema.anyOf ? 'anyOf' : 'oneOf'} — falling back to z.unknown()`);
      return z.unknown();
    }

    // Special case: nullable pattern — [SomeType, { type: "null" }]
    // Resolve $ref variants first so { $ref: "#/$defs/NullType" } is detected as null
    if (variants.length === 2) {
      const resolved = variants.map((v) => (v.$ref ? (resolveRef(v.$ref, rootSchema) ?? v) : v));
      const nullIndex = resolved.findIndex((v) => v.type === 'null');
      if (nullIndex !== -1) {
        const otherVariant = variants[nullIndex === 0 ? 1 : 0];
        return convertSchemaNode(otherVariant, rootSchema, visitedRefs).nullable();
      }
    }

    const schemas = variants.map((v) => convertSchemaNode(v, rootSchema, visitedRefs));
    if (schemas.length >= 2) {
      return z.union(schemas as [z.ZodType, z.ZodType, ...z.ZodType[]]);
    }
    return schemas[0] || z.unknown();
  }

  // Handle array of types (e.g. ["string", "null"] — JSON Schema Draft 4/6/7 nullable pattern)
  if (Array.isArray(schema.type)) {
    const types = schema.type;
    if (types.length === 2 && types.includes('null')) {
      const nonNullType = types.find((t) => t !== 'null');
      if (nonNullType) {
        return convertSchemaNode(
          { ...schema, type: nonNullType },
          rootSchema,
          visitedRefs,
        ).nullable();
      }
    }
    const schemas = types.map((type) =>
      convertSchemaNode({ ...schema, type }, rootSchema, visitedRefs),
    );
    if (schemas.length >= 2) {
      return z.union(schemas as [z.ZodType, z.ZodType, ...z.ZodType[]]);
    }
    return schemas[0] || z.unknown();
  }

  // Handle object schemas — delegate to convertObjectSchema which handles
  // both fixed-property objects and record/map types (additionalProperties).
  if (schema.type === 'object') {
    return convertObjectSchema(schema, rootSchema, visitedRefs);
  }

  // Handle non-object schemas (string, number, boolean, null, array, etc.)
  if (schema.type && typeof schema.type === 'string') {
    return convertPrimitiveSchema(schema, rootSchema, visitedRefs);
  }

  // If we have properties but no type, assume it's an object
  if (schema.properties) {
    return convertObjectSchema(schema, rootSchema, visitedRefs);
  }

  // Default to unknown type as a fallback
  logWarn(
    `Schema node could not be converted — no recognized type, $ref, or properties. ` +
      `Keys present: ${Object.keys(schema).join(', ')}. Falling back to z.unknown()`,
  );
  return z.unknown();
}

/**
 * Resolves a JSON Schema $ref pointer (e.g. "#/$defs/Foo") against the root schema.
 * Only "#/<path>" JSON Pointer fragment references are supported (bare "#" is not handled).
 * Returns the resolved sub-schema, or null if resolution fails.
 * Logs a warning via logWarn when resolution fails (unsupported format, missing target, etc.).
 */
function resolveRef(ref: string, rootSchema: JsonSchema): JsonSchema | null {
  if (!ref || typeof ref !== 'string' || !ref.startsWith('#/')) {
    if (
      typeof ref === 'string' &&
      (ref.includes('://') || (ref.includes('.') && !ref.startsWith('#')))
    ) {
      logWarn(
        `Cannot resolve $ref "${ref}": external references are not supported — falling back to permissive schema`,
      );
    } else {
      logWarn(
        `Cannot resolve $ref: unexpected format "${ref}" — only "#/" fragment references are supported`,
      );
    }
    return null;
  }

  const path = ref.slice(2).split('/'); // "#/$defs/Foo" → ["$defs", "Foo"]
  let current: unknown = rootSchema;

  for (const segment of path) {
    if (!current || typeof current !== 'object') {
      logWarn(`Cannot resolve $ref "${ref}": path segment "${segment}" hit a non-object`);
      return null;
    }
    // Narrowed to a non-null object above; JsonSchema's index signature lets us
    // walk an arbitrary pointer path without losing type safety on the way in.
    current = (current as JsonSchema)[segment];
  }

  if (current === undefined || current === null) {
    logWarn(`Cannot resolve $ref "${ref}": target not found in schema`);
    return null;
  }
  if (typeof current !== 'object') {
    logWarn(
      `Cannot resolve $ref "${ref}": resolved to ${typeof current} instead of a schema object`,
    );
    return null;
  }
  return current as JsonSchema;
}

/**
 * Converts a JSON Schema object to a Zod object schema
 * @param schema JSON Schema object
 * @param rootSchema The root JSON Schema for $ref resolution
 * @param visitedRefs Tracks visited $ref paths to prevent circular recursion
 * @param coerceProperties When true, wraps each property that is NOT explicitly
 *   typed as `"string"` in a `z.preprocess()` that parses JSON-encoded object/array
 *   strings before validation. Only ever set by the root call from
 *   {@link jsonSchemaToZod} (top-level properties only); nested conversions are
 *   never coerced, preserving the historical top-level-only semantics.
 * @returns Zod object schema
 */
function convertObjectSchema(
  schema: JsonSchema,
  rootSchema: JsonSchema,
  visitedRefs: Set<string>,
  coerceProperties = false,
): z.ZodType {
  const properties: Record<string, z.ZodType> = {};
  const required = Array.isArray(schema.required) ? schema.required : [];

  // Process each property
  if (schema.properties && typeof schema.properties === 'object') {
    Object.entries(schema.properties).forEach(([key, propSchema]) => {
      let zodProperty = convertSchemaNode(propSchema, rootSchema, visitedRefs);

      // Add description if available
      if (propSchema.description) {
        zodProperty = zodProperty.describe(propSchema.description);
      }

      // Parse stringified JSON objects/arrays before this property validates.
      // Skipped for any param that can accept a string (literal/array/union/$ref
      // string, string enum) so a legitimate JSON-looking string is left intact
      // rather than parsed into an object and then rejected.
      //
      // Only hard-fail on malformed JSON (pass `ctx`) when the param is an
      // explicit object/array container — there `main` already rejects a
      // stringified value, so a targeted issue is a strict message upgrade. An
      // untyped param accepts any string on `main`, so it stays lenient and a
      // malformed string passes through unparsed rather than becoming a new
      // hard rejection.
      if (coerceProperties && !acceptsString(propSchema, rootSchema)) {
        const strict = isExplicitContainer(propSchema, rootSchema);
        zodProperty = z.preprocess(
          (val, ctx) => coerceJsonStringValue(val, strict ? ctx : undefined, key),
          zodProperty,
        );
      }

      // Make property optional if it's not in the required array
      if (!required.includes(key)) {
        zodProperty = zodProperty.optional();
      }

      properties[key] = zodProperty;
    });
  }

  const hasProperties = Object.keys(properties).length > 0;

  // Record/map type: no fixed properties, just typed values
  if (
    !hasProperties &&
    schema.additionalProperties &&
    typeof schema.additionalProperties === 'object'
  ) {
    return z.record(
      z.string(),
      convertSchemaNode(schema.additionalProperties, rootSchema, visitedRefs),
    );
  }

  // Create the base object schema
  const objectSchema = z.object(properties);

  // Handle additionalProperties per JSON Schema semantics:
  //   false -> reject unknown keys (.strict())
  //   true / {} / {type:...} / undefined -> allow unknown keys (.loose())
  if (schema.additionalProperties === false) {
    return objectSchema.strict();
  } else {
    return objectSchema.loose();
  }
}

/**
 * Converts a JSON Schema node with an explicit type (string, number, boolean, null, or array)
 * to a Zod type. Despite the name, this also dispatches array schemas.
 * @param schema JSON Schema with a `type` field
 * @param rootSchema The root JSON Schema for $ref resolution
 * @param visitedRefs Tracks visited $ref paths to prevent circular recursion
 * @returns Zod type
 */
function convertPrimitiveSchema(
  schema: JsonSchema,
  rootSchema: JsonSchema,
  visitedRefs: Set<string>,
): z.ZodType {
  switch (schema.type) {
    case 'string':
      return convertStringSchema(schema);
    case 'number':
    case 'integer':
      return convertNumberSchema(schema);
    case 'boolean':
      return convertBooleanSchema(schema);
    case 'null':
      return z.null();
    case 'array':
      return convertArraySchema(schema, rootSchema, visitedRefs);
    default:
      logWarn(`Unrecognized schema type "${String(schema.type)}" — falling back to z.unknown()`);
      return z.unknown();
  }
}

/**
 * Converts a JSON Schema string to a Zod string
 * @param schema JSON Schema string
 * @returns Zod string
 */
function convertStringSchema(schema: JsonSchema): z.ZodString {
  let stringSchema = z.string();

  // Handle enum
  if (Array.isArray(schema.enum)) {
    // For string enums, use z.enum instead of a string schema
    if (schema.enum.length > 0) {
      // Ensure we have at least one value for the enum
      return z.enum(schema.enum as [string, ...string[]]) as unknown as z.ZodString;
    }
  }

  // Handle minLength
  if (typeof schema.minLength === 'number') {
    stringSchema = stringSchema.min(schema.minLength);
  }

  // Handle maxLength
  if (typeof schema.maxLength === 'number') {
    stringSchema = stringSchema.max(schema.maxLength);
  }

  // Handle pattern
  if (schema.pattern) {
    try {
      stringSchema = stringSchema.regex(new RegExp(schema.pattern));
    } catch (error) {
      logWarn(
        `Invalid regex pattern in schema: ${schema.pattern} — pattern validation skipped for this property`,
        error,
      );
    }
  }

  // Handle format
  if (schema.format) {
    switch (schema.format) {
      case 'email':
        stringSchema = z.string().email();
        break;
      case 'uri':
        stringSchema = z.string().url();
        break;
      case 'date-time':
        stringSchema = z.string().datetime();
        break;
      // Add more formats as needed
    }
  }

  return stringSchema;
}

/**
 * Converts a JSON Schema number to a Zod number
 * @param schema JSON Schema number
 * @returns Zod number
 */
function convertNumberSchema(schema: JsonSchema): z.ZodNumber {
  let numberSchema = schema.type === 'integer' ? z.number().int() : z.number();

  // Handle minimum/maximum
  if (typeof schema.minimum === 'number') {
    numberSchema = numberSchema.gte(schema.minimum);
  }
  if (typeof schema.maximum === 'number') {
    numberSchema = numberSchema.lte(schema.maximum);
  }

  // Handle exclusiveMinimum/exclusiveMaximum
  if (typeof schema.exclusiveMinimum === 'number') {
    numberSchema = numberSchema.gt(schema.exclusiveMinimum);
  }
  if (typeof schema.exclusiveMaximum === 'number') {
    numberSchema = numberSchema.lt(schema.exclusiveMaximum);
  }

  // Handle multipleOf
  if (typeof schema.multipleOf === 'number') {
    const multipleOf = schema.multipleOf;
    // refine() returns a ZodEffects, not a ZodNumber, so cast via unknown
    return numberSchema.refine((val) => val % multipleOf === 0, {
      message: `Value must be a multiple of ${multipleOf}`,
    }) as unknown as z.ZodNumber;
  }

  return numberSchema;
}

/**
 * Converts a JSON Schema boolean to a Zod boolean
 * @param schema JSON Schema boolean
 * @returns Zod boolean
 */
function convertBooleanSchema(_schema: JsonSchema): z.ZodBoolean {
  return z.boolean();
}

/**
 * Converts a JSON Schema array to a Zod array
 * @param schema JSON Schema array
 * @param rootSchema The root JSON Schema for $ref resolution
 * @param visitedRefs Tracks visited $ref paths to prevent circular recursion
 * @returns Zod array
 */
function convertArraySchema(
  schema: JsonSchema,
  rootSchema: JsonSchema,
  visitedRefs: Set<string>,
): z.ZodArray {
  // Determine the item type
  let itemSchema: z.ZodType;

  if (schema.items) {
    // If items is an object, it's the schema for all items
    itemSchema = convertSchemaNode(schema.items, rootSchema, visitedRefs);
  } else {
    // Default to unknown if items is not specified
    itemSchema = z.unknown();
  }

  let arraySchema = z.array(itemSchema);

  // Handle minItems/maxItems
  if (typeof schema.minItems === 'number') {
    arraySchema = arraySchema.min(schema.minItems);
  }
  if (typeof schema.maxItems === 'number') {
    arraySchema = arraySchema.max(schema.maxItems);
  }

  // Handle uniqueItems
  if (schema.uniqueItems === true) {
    // refine() returns a ZodEffects, not a ZodArray, so cast via unknown
    return arraySchema.refine((items) => new Set(items).size === items.length, {
      message: 'Array items must be unique',
    }) as unknown as z.ZodArray;
  }

  return arraySchema;
}
