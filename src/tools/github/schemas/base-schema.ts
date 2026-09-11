import { z } from 'zod';

/**
 * Creates a GitHub tool schema with org/repo fields
 * @param extraSchema Additional schema fields to include
 * @returns A Zod schema that validates input
 */
export function createGithubBaseSchema<T extends z.ZodRawShape = Record<never, never>>(
  extraSchema?: T,
) {
  // Create a base schema with org and repo, then merge in the extra fields via
  // `.extend()`. Spreading a generic `T` directly into the `z.object({...})`
  // literal loses the concrete key/value types (zod infers a widened
  // `Record<string, ZodTypeAny>` shape instead), which made every property
  // downstream resolve to `unknown`. `.extend()` has a properly typed generic
  // signature that preserves the literal shape of both the base and `T`.
  //
  // `T` also needs a default type (`Record<never, never>`) rather than an
  // `extraSchema: T = {} as T` value default: with no call-site argument to
  // infer `T` from, TS falls back to the constraint (`z.ZodRawShape`, an
  // index signature) instead of `{}`, which is what actually caused the
  // widened/unknown shape above.
  return z
    .object({
      org: z.string().describe('The organization name'),
      repo: z.string().describe('The repository name'),
    })
    .extend(extraSchema ?? ({} as T));
}

/**
 * Base schema with just org and repo
 */
export const GithubBaseSchema = createGithubBaseSchema();

/**
 * Combined function to validate and transform GitHub parameters
 * This handles both schema validation and org → owner transformation
 *
 * @param schema The schema to validate against
 * @param args The input arguments to validate and transform
 * @returns Validated and transformed parameters with owner instead of org
 */
export function parseAndTransformGitHubParams<T extends z.ZodTypeAny>(
  schema: T,
  args: unknown,
): Omit<z.infer<T>, 'org'> & { owner: string } {
  // First validate the input against the schema
  const validatedArgs = schema.parse(args) as Record<string, unknown> & { org: unknown };

  // Then transform org to owner
  const { org, ...rest } = validatedArgs;

  return {
    owner: org,
    ...rest,
  } as Omit<z.infer<T>, 'org'> & { owner: string };
}
