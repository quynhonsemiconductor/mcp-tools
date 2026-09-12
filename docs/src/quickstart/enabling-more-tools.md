# Enabling more tools

The shipped configuration (`docs/qnscmcp.example.yaml`) offers 114 tools, and 113 of
them are verified working. Everything below is switched **off** on purpose: each
needs a credential or a service that does not exist yet, and a tool that fails when
the model tries it is worse than one that was never offered.

Each section says what to obtain, where to put it, and — honestly — whether it is
worth the effort.

Add credentials to `.env` at the repository root (gitignored, loaded automatically)
or to the `env` block of your client configuration. Then add the category back to
`tools.includeCategories` in `.qnscmcp.yaml`.

---

## chrome-devtools — 26 tools · no credential · recommended

Claude drives a real Chrome browser: navigate, click, fill forms, read the console,
capture network requests, run performance traces. Useful for debugging a web app.

**Setup.** No credential. The bundle is built from upstream source:

```bash
bun run generate:bundles      # takes about 40 seconds
```

Then remove `'Bundled'` from `tools.excludeCategories`.

Verifying it opens a visible Chrome window, which is why it is not verified here.

**Worth it?** Yes, if anyone works on `rova` or `qnsc-landing`. It is the only
remaining group with real value and no credential to obtain.

---

## k6 — 6 tools · one token

Load-test results from Grafana Cloud k6: list tests, read runs, compare results
against thresholds.

**Setup.**

1. In Grafana Cloud, open the k6 app → **Settings** → **Personal API token**
2. `GRAFANA_K6_TOKEN=<token>` in `.env`
3. Add `k6` to `includeCategories`

The tools talk to `api.k6.io`. Note this is Grafana Cloud **k6**, a different product
from Grafana dashboards — having Grafana does not mean you have this.

**Worth it?** Only if you actually run load tests.

---

## Google CrUX — 4 tools · free key

Real-world performance data (Core Web Vitals) for any public URL, from Chrome
telemetry. Answers "is our site slow for actual users", not "is it slow on my Mac".

**Setup.**

1. Google Cloud Console → enable the **Chrome UX Report API**
2. Create an API key
3. `GOOGLE_CRUX_API_KEY=<key>` in `.env`
4. Add `CrUX` to `includeCategories`

**Worth it?** Only for public sites with enough traffic to appear in the dataset.
`qnsc-landing` might; internal tools will not.

---

## PostgreSQL — 4 tools · connection details

List databases and tables, describe a table, run a read query. Supports several
named profiles so you can reach more than one database.

**Setup.** One set per database, where `LOCAL` is a label you choose:

```bash
POSTGRES_PROFILE_LOCAL_HOST=127.0.0.1
POSTGRES_PROFILE_LOCAL_PORT=5432          # optional
POSTGRES_PROFILE_LOCAL_USER=postgres
POSTGRES_PROFILE_LOCAL_PASSWORD=…
POSTGRES_PROFILE_LOCAL_DATABASE=…         # optional
POSTGRES_PROFILE_LOCAL_SSL_MODE=require   # optional
```

IAM authentication against RDS is also supported: set `_AUTH_METHOD=iam` and
`_REGION`, and no password.

Then add `PostgreSQL` to `includeCategories`.

**Worth it?** Yes if `qnsc-kb-backend`'s database is one you inspect often. Point it
at a read-only replica or a read-only role rather than a production primary.

---

## SwaggerHub — 2 tools · one token

Save an OpenAPI document, generate a client from a spec.

**Setup.** SwaggerHub → **API Keys**, then `SWAGGER_HUB_API_KEY=<key>` in `.env`, and
remove `'Swagger'` from `excludeCategories`.

**Worth it?** Only if you use SwaggerHub. Two tools is a small return.

---

## SharePoint — 56 tools · Azure app registration · read the warning

The largest group by count: read and write SharePoint lists, files, sites, content
types, navigation and permissions across your M365 tenant.

**Setup** is the most involved here, and needs Azure AD admin rights.

1. Azure Portal → **App registrations** → **New registration**
2. Grant **application** permissions (not delegated): `Sites.Read.All`, and
   `Sites.ReadWrite.All` only if you want writes. Grant admin consent.
3. Create a certificate, upload the public key to the registration, and keep the
   `.pfx` and its password
4. Set all four:

```bash
AZURE_APPLICATION_ID=…
AZURE_APPLICATION_CERTIFICATE_THUMBPRINT=…
AZURE_APPLICATION_CERTIFICATE_PASSWORD=…
M365_TENANT_ID=dc0f2078-ac28-4ff2-b21a-d4b28df32361
```

5. Remove `'Bundled'` from `excludeCategories`

**Two things to weigh before doing this.**

The bundle's own security scan, recorded in `bundled/sharepoint/README.md`, reports a
**medium-severity command injection risk** in its certificate handling: the
thumbprint and password are interpolated into PowerShell commands, and the password
appears in a command line where it can surface in process listings. That is upstream
code, not ours.

Application permissions are tenant-wide. `Sites.Read.All` means every SharePoint site
in the tenant, not just the ones a given person can see — so this grants Claude
broader access than the individual using it.

**Worth it?** Only if Claude reading M365 documents is a real need. It is 56 of the
137 remaining tools, which makes it look like the big prize, but it is also the
highest setup cost and the only group carrying a known security finding. Consider
starting read-only.

---

## Not available regardless of setup

**AWS Knowledge (5 tools).** AWS hosts the endpoint publicly and it lists its tools,
but answers `tools/call` with *"Http operation is not supported for gateway protocol
type MCP"*. Reproduced with raw `curl` at protocol versions 2024-11-05, 2025-03-26
and 2025-06-18. Nothing to configure — re-enable it if AWS fixes the endpoint.

**`reauth`.** Needs an Entra app registration with a client secret. It does reach
Microsoft and returns `AADSTS7000218` without one.

**`weather`.** Calls `api.weather.gov`, the US National Weather Service. Verified
working for New York coordinates and returning 404 for Ho Chi Minh City.

**`location-to-coords`.** Needs `GEOCODE_MAPS_API_KEY` from geocode.maps.co.

**`figma-dev`.** Needs the Figma desktop app running with Dev Mode's local server on
port 3845.
