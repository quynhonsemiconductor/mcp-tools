# Remote MCP Servers

Remote MCP servers are hosted elsewhere and reached over HTTP rather than spawned as
a local subprocess. They are opt-in: list an id under `tools.includeRemoteMCPs` in
`.qnscmcp.yaml`.

Definitions live in [`available-remote-servers.ts`](./available-remote-servers.ts).

## Available servers

| ID | Reached | Auth | Setup |
|---|---|---|---|
| `aws-knowledge-mcp-server` | Directly, at `knowledge-mcp.global.api.aws` | None — public endpoint | [SETUP](./SETUP_aws-knowledge-mcp-server.md) |
| `figma-dev` | `http://localhost:3845/mcp`, served by the Figma desktop app | None — local | [SETUP](./SETUP_figma-dev.md) |

```yaml
tools:
  includeRemoteMCPs:
    - aws-knowledge-mcp-server
```

## Why there are only two

There were 19. The other 17 — Atlassian, Datadog, PagerDuty, Slack, Stripe, New Relic,
Postman, Kong, Cortex, Bitrise, Smartsheet, LogRocket, Lucid, Pendo, Amplitude, k6 and
a `github` proxy — all routed through a hosted platform gateway at `*.ai.qnsc.vn`.
That gateway is not deployed for this organization and its hostnames have no DNS
records, so every one of them failed to connect. They were removed rather than left in
place to fail.

The gateway did four things worth knowing about, in case one is ever rebuilt:

- proxied `https://<gateway>/<name>/mcp` to each vendor
- validated an Entra ID JWT sent as `x-gateway-auth`
- held each user's vendor credential and injected it per request, so no vendor API key
  lived on a laptop and every call ran as that user
- served a routing policy deciding local-vs-remote tool selection

Most of that client-side machinery is still here — `remote-mcp-client.ts`,
`platform-auth.ts`, `remote-policy.ts` — and would work against a compatible gateway.
Nothing currently exercises it.

## Adding a server

Prefer a vendor's own public endpoint over a proxy. `getDirectMcpUrl(name, url, allowedHostSuffixes)`
is for that case: it pins the vendor domain, so a `{NAME}_MCP_URL` override cannot
redirect the connection somewhere else. `getPlatformMcpUrl(name)` builds a
gateway-routed URL and only makes sense if a gateway exists.

Add the entry to `available-remote-servers.ts`, write a `SETUP_<id>.md` beside this
file, and cover it in `available-remote-servers.test.ts`.

## Auth types

`authType` on a definition selects how credentials are attached:

| Value | Behaviour |
|---|---|
| unset | Nothing client-side. Either the endpoint is public, or a gateway brokers identity |
| `'static'` | Headers with env-var substitution |
| `'static-bearer'` | Per-request `Authorization` header from `SERVICE_AUTH_MAP` |
| `'oauth'` | OAuth 2.1 flow managed by the MCP SDK |
| `'entra-id'` | Entra ID SSO through `EntraIdTokenManager` |

Both servers listed above leave it unset.

## Troubleshooting

`qnsc-mcp doctor` validates config and reports unknown server ids.
`qnsc-mcp list-tools --filtered` shows what a config actually enables — a remote
server that failed to connect contributes no tools.
