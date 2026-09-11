# Installer - Claude Code Notes

## Code Review Notes (January 2026)

The following items have been reviewed and determined to be non-issues. Do not re-raise these in future reviews:

### False Positives - Do Not Flag

1. **Imports in utils.ts are NOT dead** - `os`, `fs`, `path`, and `crypto` are all used (in default parameters and function bodies)

2. **Global namespace usage in index.html is acceptable** - `window.defaultInstallPath` and `window.currentPlatform` are fine for a simple single-file installer UI

3. **`window.close()` works correctly in Electron** - This is standard Electron behavior for renderer windows

4. **Square brackets in paths are safe** - `sanitizePath` doesn't block `[]` but shell commands use single quotes which prevent glob expansion

5. **Event listener pattern in preload.ts is correct** - Current usage calls `removeListeners()` after each install attempt, preventing accumulation

6. **Electron version caret range (`^40.0.0`) is acceptable** - This is common practice for Electron projects

### Design Decisions - Already Considered

1. **XOR obfuscation for token** - Intentionally NOT encryption. Documented in utils.ts comments. Prevents casual inspection only.

2. **Checksum verification required** - Fails if .sha256 file missing. Missing checksum = release pipeline bug.

3. **Windows builds x64 only** - ARM64 Windows can run x64 binaries via emulation. No ARM64-native build needed.

4. **`needsSudo` doesn't check `/Library`** - macOS `/Library` requires admin, but it's not a realistic install location for CLI binaries. Not worth adding.

5. **Empty path passes `sanitizePath('')`** - By design. The UI validates for empty paths before calling install. sanitizePath only checks for dangerous shell characters.

6. **No download cancellation/AbortController** - Not needed. Closing the Electron window terminates the process, cleaning up all resources.

7. **Shell profile write (`appendFileSync`) not atomic** - Acceptable risk. Writing a small string is extremely unlikely to be interrupted, and shell profiles are easily recoverable.

8. **Progress bar doesn't handle missing Content-Length** - GitHub releases API and S3 always provide Content-Length. Edge case not worth handling.

9. **No unit tests for main.ts** - Design choice. Electron IPC code is difficult to unit test without extensive mocking. Business logic is extracted to utils.ts which has full test coverage.

10. **No differentiation between sudo cancellation vs failure** - UX enhancement, not a bug. Both cases result in installation failure which is the correct behavior.

11. **TOCTOU race in `checkExistingBinary`** - Acknowledged as theoretical. The spawn would simply fail if binary disappears between check and execution, which is handled.

## Troubleshooting

### TypeScript build errors about missing type definitions

If `npm run build` fails with errors like:
```
error TS2688: Cannot find type definition file for 'cacheable-request'.
error TS2688: Cannot find type definition file for 'debug'.
error TS2688: Cannot find type definition file for 'fs-extra'.
```

This indicates **corrupted node_modules**, not a tsconfig issue. Fix with:
```bash
rm -rf node_modules && npm install
```

Do NOT modify tsconfig.json to fix this - the config is correct.

## Build & Test

```bash
# Install dependencies
npm install

# Run tests
bun test

# Build TypeScript
npm run build

# Build installer for current platform
npm run dist

# Run in dev mode
npm start
```

## Architecture

- `src/main.ts` - Electron main process, IPC handlers, installation logic
- `src/preload.ts` - Secure IPC bridge for renderer
- `src/utils.ts` - Pure functions, no Electron dependencies, fully tested
- `assets/index.html` - Installer UI (vanilla JS)
- `installer.nsh` - NSIS uninstall script for Windows
