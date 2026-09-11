import eslint from '@eslint/js';
import eslintPluginPrettier from 'eslint-plugin-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/*.config.js',
      '!**/eslint.config.js',
      'build/**',
      'bundled-mcps/**',
      // Build artifacts from scripts/collect-setup-docs.ts. The .d.ts is shadowed by
      // the generated .ts whenever that exists, so it falls outside the type-checked
      // program and typed-linting cannot parse it. Generated output isn't hand-edited.
      'src/generated/**'
    ]
  },
  {
    // Mirrors tsconfig.json's own "src/**/*mock*" exclude — these files
    // aren't part of the type-checked program, so typed-linting can't parse
    // them. They still get the plain-JS ruleset from the config below.
    files: ['src/**/*.ts'],
    ignores: ['src/**/*mock*'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json'
      }
    },
    plugins: {
      prettier: eslintPluginPrettier
    },
    rules: {
      semi: 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // MCP SDK/CLI code uses async callbacks in void-return contexts (setImmediate,
      // event handlers).
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      'no-console': 'warn',

      // --- Ratchet: adopting typed-linting on an existing codebase (2026-09) ---
      // These rules are real and worth having, but this codebase pre-dates
      // typed-linting and has ~2700 existing violations, mostly from untyped
      // SDK/JSON boundaries (any-typed API responses) and fire-and-forget
      // async calls that need individual review, not a blind bulk fix.
      // Downgraded to 'warn' so CI doesn't fail on day one; promote to
      // 'error' (or fix and remove the override) incrementally as each
      // category's debt is paid down. Do not add NEW violations under a
      // 'warn' rule and call it done — these are still real bugs to fix.
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/await-thenable': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/no-base-to-string': 'warn',
      'no-empty': 'warn',
      // Small-count but each needs a look before flipping to 'error' —
      // some are real bugs, at least one (prefer-const in
      // local-mcp-manager.test.ts) is a forward-declared closure var that
      // can't trivially become const. Triage individually, don't bulk-fix.
      'no-fallthrough': 'warn',
      'no-control-regex': 'warn',
      '@typescript-eslint/only-throw-error': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/prefer-promise-reject-errors': 'warn',
      'no-useless-catch': 'warn',
      'prefer-const': 'warn',
      'no-constant-binary-expression': 'warn',
      '@typescript-eslint/unbound-method': 'warn',
      '@typescript-eslint/no-this-alias': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-redundant-type-constituents': 'warn'
    }
  },
  // CLI command surfaces and the display helper write directly to stdout/stderr
  // as their PRIMARY user interface (tables, prompts, help text) — console is the
  // intended output here, not a logging shortcut. Runtime/library code still uses
  // the structured logger (services/logger) and keeps no-console as a warning.
  {
    files: [
      'src/commands/**/*.ts',
      'src/lib/display.ts',
      // The bundler prints build progress/results and the updater prints
      // download/apply progress directly to the user running `mcp bundle`/`mcp update`.
      'src/gateway/bundler/**/*.ts',
      'src/utils/update-*.ts',
      // Entry points and the logger's own console sink.
      'src/bin/**/*.ts',
      'src/mcp.ts',
      'src/services/logger/logging.ts',
      // Standalone verify script (not shipped in the library surface).
      'src/utils/bun-assets-enoent.verify.ts'
    ],
    rules: {
      'no-console': 'off'
    }
  },
  // Mock/fixture files excluded from the type-checked program (see above) —
  // basic linting only, no type-aware rules (parser has no project to use).
  {
    files: ['src/**/*mock*.ts'],
    extends: [eslint.configs.recommended],
    languageOptions: {
      // TS-aware parser so interfaces/types parse, but no `project` — these
      // files aren't part of the type-checked program, so no type info.
      parser: tseslint.parser
    },
    plugins: {
      prettier: eslintPluginPrettier
    },
    rules: {
      semi: 'error',
      'no-console': 'off',
      // Base eslint's no-undef/no-unused-vars don't understand TS syntax
      // (interfaces, type-only references) and false-positive on every one
      // without the type-aware parser. typescript-eslint's own recommended
      // config disables these for the same reason.
      'no-undef': 'off',
      'no-unused-vars': 'off'
    }
  },
  // Test files use bun:test's mock()/spyOn(), which are inherently untyped —
  // relax unsafe rules the same way for test mocks.
  {
    files: ['src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
      'no-console': 'off'
    }
  }
);
