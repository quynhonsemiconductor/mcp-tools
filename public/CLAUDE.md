# public/ — the served web UI

This directory is the web interface served by the `qnsc-mcp web` command, and it is
the only UI users get. The Bun web server in `src/commands/webserver.ts` imports
`public/index.html` (and the Handlebars templates here), bundles this directory, and
embeds it into the shipped binary. (There used to be an unshipped `frontend/` React
proof-of-concept alongside this — removed; it was never served or built.)

## How it's served

- **Single-page app.** `webserver.ts` maps `/`, `/config`, `/config-editor`, `/tools`,
  and `/logs` to the same `index.html`. There is no per-page HTML file; client-side JS
  decides what to render based on the route.
- **Bundled into the binary.** Because `webserver.ts` imports `index.html` as a module,
  Bun bundles the local JS/CSS it references at build time. Editing files here changes
  the shipped product.
- **Templates.** `templates/*.handlebars` are served as JSON from the `/templates` route
  and rendered client-side with Handlebars.

## Layout

- `index.html` — the SPA shell. Lists the scripts/styles below and pulls a few libraries
  from CDNs (water.css, Handlebars, highlight.js, marked, DOMPurify).
- `js/app.js` — tool browsing and call history.
- `js/config-editor.js` + `js/config-editor/` — the configuration editor (modular; see
  `js/config-editor/README.md` for its internal architecture).
- `js/logs-viewer.js` — the logs view.
- `js/theme-manager.js` — light/dark theme handling.
- `css/` — `styles.css`, `config-editor.css`, `logs-viewer.css`.
- `templates/` — Handlebars partials served via the `/templates` route.

## Working here

This is vanilla JavaScript: no build framework, ES modules loaded directly in the
browser. Changes are picked up by `bun run dev:web` with hot reload. To change what
users see in the web UI, change files here.
