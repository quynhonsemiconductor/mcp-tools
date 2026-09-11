# API Keys

Credentials for the tools this build ships. You only need keys for what you enable in
your [configuration](../configuration.md) — most people need one or two.

[`TOOLS.md`](https://github.com/quynhonsemiconductor/mcp-tools/blob/main/TOOLS.md)
lists, per tool, which variable it requires.

## Which do I need?

| If you want | Set | Unlocks |
|---|---|---|
| GitHub: issues, PRs, Actions, projects, repos | `GITHUB_TOKEN` | 92 tools |
| Grafana k6 load-test results | `GRAFANA_K6_TOKEN` | 6 tools |
| Core Web Vitals from the Chrome UX Report | `GOOGLE_CRUX_API_KEY` | 4 tools |
| SwaggerHub / OpenAPI generation | `SWAGGER_HUB_API_KEY` | 2 tools |
| Place-name to coordinates | `GEOCODE_MAPS_API_KEY` | 1 tool |

Nothing is needed for the largest group of all: Knowledge Graph, NPM, PostgreSQL,
Chrome DevTools, AWS documentation and most Utility tools run without credentials.

Add them wherever your client passes environment variables — see
[VS Code](clients/vs-code.md), [JetBrains](clients/jetbrains.md) or
[Claude](clients/claude.md).

## GITHUB_TOKEN

The biggest single unlock. Requests go to `api.github.com`, so a standard
github.com token works.

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens**
2. Create a classic token with `repo`, `read:org` and `workflow`
3. Copy it — GitHub shows it once

Scope it to what you need: `repo` alone is enough for issues, pull requests and
file contents; `workflow` is only for the Actions tools.

## GRAFANA_K6_TOKEN

Grafana Cloud → **k6** → **Personal API tokens**. Reads load-test projects,
runs and metrics.

## GOOGLE_CRUX_API_KEY

1. In the [Google Cloud Console](https://console.cloud.google.com), select or create a project
2. **APIs & Services → Library**, enable **Chrome UX Report API**
3. **APIs & Services → Credentials → Create credentials → API key**

See the [CrUX API docs](https://developer.chrome.com/docs/crux/api). The API only
returns data for origins with enough real-user traffic.

## SWAGGER_HUB_API_KEY

SwaggerHub → **API Keys** in your account settings.

## GEOCODE_MAPS_API_KEY

Register at [geocode.maps.co](https://geocode.maps.co) for the `location-to-coords`
tool.

## QNSC_MCP_API_KEY

Required by the Memory tools, which call a platform API this organization does not
host. There is no key to obtain and those tools cannot work until one exists.

## Removed services

Earlier versions documented keys for New Relic, Splunk and Salesforce. Those tools
reached their vendors through a hosted platform gateway that is not deployed here, so
they were removed — there is no key to set. The same applies to the other remote
servers in that fleet: Atlassian, Datadog, PagerDuty, Slack, Stripe, Postman, Kong,
Cortex, Bitrise, Smartsheet, LogRocket, Lucid, Pendo and Amplitude.

See [remote MCP servers](https://github.com/quynhonsemiconductor/mcp-tools/blob/main/src/remote-mcps/README.md)
for what the gateway did and what remains.
