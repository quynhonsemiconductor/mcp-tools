/**
 * Type declarations for the build-generated embedded setup-docs module.
 *
 * The implementation (`setup-docs.ts`) is produced by `scripts/collect-setup-docs.ts`
 * during `scripts/build.ts` and is gitignored, so it does not exist in a plain
 * checkout. `src/utils/setup-resolver.ts` imports it for production builds via
 * `typeof import('../generated/setup-docs')`, which fails type resolution when the
 * artifact is absent — that is why CI type-checked red without building first.
 *
 * These declarations mirror the generator's output. TypeScript prefers the real
 * `.ts` when it is present (local dev and release builds), and falls back to this
 * file otherwise, so `tsc` succeeds with or without the build step. Types only —
 * nothing here is emitted, so the bundler is unaffected.
 *
 * Keep in sync with the `SetupDoc` interface emitted by `scripts/collect-setup-docs.ts`.
 */

export interface SetupDoc {
  toolId: string;
  content: string;
  source: 'native' | 'bundled' | 'remote' | 'local';
}

/** Key format: `{toolId}:{source}` (e.g. `github:native`). */
export declare const SETUP_DOCS: Record<string, SetupDoc>;

export declare function getEmbeddedSetupDoc(
  toolId: string,
  source: 'native' | 'bundled' | 'remote' | 'local',
): SetupDoc | null;

export declare function getAllEmbeddedSetupDocs(): SetupDoc[];
