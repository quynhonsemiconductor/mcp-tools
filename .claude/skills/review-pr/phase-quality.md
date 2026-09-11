# Phase 5: Quality & Best Practices Review

**Goal:** Find issues with error handling, resource management, patterns, and maintainability.

---

## Scope

**Covers:** Error handling, resource management, pattern consistency, performance, code clarity.

**Does NOT cover:** Bugs/logic errors (Phase 3), security (Phase 4), test coverage (Phase 6), style/formatting (leave to linters).

---

## Checklist

### Error Handling
- Are errors caught where operations can fail? (JSON.parse, network calls, file I/O)
- Are caught errors handled appropriately? (not swallowed silently, not logged-then-ignored while continuing with undefined state)
- Are error messages informative? (include context like IDs, status codes — not just "Failed")

### Resource Management
- Database connections released in `finally` blocks?
- File handles closed on error paths?
- Event listeners removed on cleanup/unmount?
- Timers (`setInterval`) cleared on teardown?

### Pattern Consistency

> Check Phase 1's context summary for project conventions from CLAUDE.md — these are explicit patterns to enforce.

- Does new code follow existing naming conventions, file structure, error handling patterns, logging format, and API style?
- Deviation is OK when the existing pattern has known problems or it's part of a planned migration. Not OK when it's just preference.

### Performance
- N+1 queries — batch where possible
- Expensive work hoisted out of loops
- Unbounded growth — arrays/caches that grow without limits

### Code Clarity

Only flag clarity issues that create **real risk of misunderstanding or future bugs**:
- Magic numbers in conditionals/calculations where meaning is genuinely unclear
- Complex conditionals where you can articulate a specific misreading someone would make
- Deep nesting that obscures control flow enough to likely cause future bugs

---

## What NOT to Report

**Zero issues is a valid outcome.** Never invent findings to fill a section.

Do not report:
- Style issues (let linters handle it)
- Subjective preferences without clear benefit
- "Could be slightly better" without real impact
- Issues in unchanged code (unless directly related)
- Anything where the only justification is "best practice says so" but you can't name a concrete consequence
- Patterns that are merely different from how you'd write it, but aren't wrong

---

## Output

Use the Finding Output Format from pr.prompt.md. Include **Category** (Error Handling / Resource Leak / Pattern / Performance / Clarity). Note good patterns you observed.
