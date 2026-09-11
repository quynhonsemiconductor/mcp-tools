# What changed, and why

<!--
The title must parse as a Conventional Commit — `pr-title.yml` enforces it, and
release-please derives the changelog and the next version from it. `feat:` bumps the
minor, `fix:` the patch.
-->

## Verification

<!-- What you actually ran, not what should pass. -->

- [ ] `bun typecheck` — zero errors
- [ ] `bun x eslint .` — zero **errors** (warnings are tolerated; ~1,400 exist and you
      are not expected to clear them)
- [ ] `bun test` — compared against `main`, not just read in isolation

Three `localMcpReferenceValidation` tests fail in a full run on `main` already. They
come from Bun's `mock.module` leaking across files, they predate your change, and they
pass when that file runs alone. Anything beyond those three is yours.

If you changed a tool, say how you exercised it. `bun run scripts/try-tool.ts <id>
'<json-args>'` calls it directly, which distinguishes a tool defect from a config or
client problem.

## Notes for the reviewer

<!--
Worth flagging if any apply:
  - a decision that could reasonably have gone the other way, and why it went this way
  - something you could not verify, and what would be needed to verify it
  - assertions removed from a test. `test-guard` fails on a net loss and will not
    explain itself; if the removal is correct — a stale `@ts-expect-error`, say — add a
    line starting `agent-forge: test-edit-approved` with the reason.
-->
