# Release Process

> **Status:** Releases now run via [Release Please](https://github.com/googleapis/release-please) (`.github/workflows/release.yml`, delegating to the shared `ci` reusable workflow — same as `rova`/`opshub`), not semantic-release. The workflow only cuts a versioned GitHub Release from `CHANGELOG.md`; it does **not** yet build/sign/notarize binaries or GUI installers, so most of this page (binary builds, Slack approval gate, macOS code signing) describes the target process, not what currently runs. Rebuild that pipeline here once QNSC decides which platforms to ship and has its own Apple Developer ID certificate — the upstream certificate (referenced below) cannot be reused.

## Commit Types and Version Impact

| Commit Type | Version Impact |
|-------------|----------------|
| `feat` | MINOR (1.x.0) |
| `fix`, `refactor`, `style` | PATCH (1.0.x) |
| `docs`, `test`, `chore`, `ci` | No release |
| `BREAKING CHANGE:` in footer | MAJOR (x.0.0) |

## Workflow

1. **Push to main** → Workflow starts
2. **Verify Release** → Dry-run determines version
3. **Build Binaries** → All platform binaries are built and validated
4. **Request Approval** → Slack notification sent with link to approve (binaries available for testing)
5. **Approval Required** → Review and approve in GitHub Actions (`release-approval` environment)
6. **Release** → Tag, changelog created (only after approval)
7. **Upload Assets** → Binaries uploaded to release, Slack notification sent

> **Note:** Binaries are built BEFORE approval is requested. This allows approvers to download and test binaries before approving the release. If any binary build fails, no approval is requested.

## Approving a Release

1. Click the workflow link from Slack (or go to Actions tab)
2. Review the planned version in the dry-run output
3. Click "Review pending deployments" → Select `release-approval` → Approve

## No Release?

If only `docs:`, `test:`, `chore:`, or `ci:` commits exist since last release, no approval is requested and no release is created.

## Batching Multiple PRs

To combine multiple PRs into a single release:

1. Create a release branch from `main`: `git checkout -b release/next`
2. Merge feature branches into the release branch (or open PRs targeting the release branch)
3. When ready, open a single PR from `release/next` → `main`
4. Merging triggers one release containing all changes

This avoids multiple rapid releases and lets you test combined changes before release.

## macOS Code Signing and Notarization

All macOS artifacts (CLI binaries and GUI installers) are signed with a Developer ID certificate and notarized with Apple during the build process. This ensures users don't see "unidentified developer" warnings or Gatekeeper blocks.

Signing and notarization run from Linux CI runners using [`rcodesign`](https://github.com/indygreg/apple-platform-rs) — no macOS runner is required.

### What gets signed and notarized

| Workflow | Artifacts | Signing | Notarization |
|----------|-----------|---------|--------------|
| `release.yml` | CLI binaries (arm64 + x64) | Developer ID + hardened runtime | Yes |
| `pr-binaries.yml` | CLI binaries (arm64 + x64) | Developer ID + hardened runtime | Yes |
| `build-installers.yml` | GUI `.app` bundles (arm64 + x64) | Developer ID + hardened runtime (nested + main) | Yes + stapled |

### Entitlements

Hardened runtime blocks JIT by default, so entitlements are required:

- **CLI binaries** (`entitlements.cli.plist`): allow-jit, allow-unsigned-executable-memory, disable-executable-page-protection, allow-dyld-environment-variables, disable-library-validation
- **GUI installers** (`installer/entitlements.mac.plist`): allow-jit, allow-unsigned-executable-memory, disable-library-validation

### MCPB packaging order

The `.mcpb` ships its own copy of the CLI binary, so it must be packed **after** the
binary is signed — otherwise Claude Desktop installs an ad-hoc signed copy with no
entitlements, which macOS 27's stricter runtime hardening refuses to launch.

`build:binary` therefore runs with `SKIP_MCPB=1` in `release.yml` and `pr-binaries.yml`,
and the workflows call `bun run package:mcpb` after the sign + notarize steps. A
follow-up step unzips the `.mcpb` and runs `rcodesign verify` on the embedded binary so
the ordering can't silently regress. Locally, a plain `bun build:binary` still packs the
`.mcpb` in one shot.

### Mach-O padding fix

Bun-compiled x64 binaries have a Mach-O issue where `__LINKEDIT` segment headers reference data beyond the actual file size, causing `rcodesign` to panic. The `scripts/fix-macho-padding.py` script pads the binary with zeros before signing. ARM64 binaries are unaffected (the script is a no-op).

### Required Secrets

#### Code Signing

| Secret | Description |
|--------|-------------|
| `APPLE_CERTIFICATE_P12_BASE64` | Base64-encoded Developer ID Application certificate (.p12) |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the .p12 file (can be empty if exported without password) |

#### Notarization (App Store Connect API)

| Secret | Description |
|--------|-------------|
| `APPLE_API_KEY_ID` | Key ID from App Store Connect (e.g., `ABC123DEFG`) |
| `APPLE_API_ISSUER_ID` | Issuer ID from App Store Connect (UUID format) |
| `APPLE_API_KEY_P8_BASE64` | Base64-encoded API key (.p8 file) |

### Setup

#### Code Signing Certificate

1. **Export your Developer ID Application certificate** from Keychain Access as a .p12 file

2. **Encode the certificate** to base64:
   ```bash
   base64 -i DeveloperIDApplication.p12 | pbcopy
   ```

3. **Add the secrets** in GitHub: Settings → Secrets and variables → Actions

#### Notarization API Key

1. **Create an API key** in [App Store Connect](https://appstoreconnect.apple.com/access/integrations/api) under Users and Access → Integrations → App Store Connect API

2. **Download the .p8 key file** (you can only download it once)

3. **Note the Key ID and Issuer ID** from the App Store Connect page

4. **Encode the .p8 file** to base64:
   ```bash
   base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy
   ```

5. **Add all three secrets** in GitHub: Settings → Secrets and variables → Actions

### Verifying a signed binary

Download a macOS binary and verify locally:

```bash
# Check signature and trust chain
codesign -dv --verbose=4 qnsc-mcp-macos-arm64

# Verify signature integrity
codesign --verify --verbose=4 qnsc-mcp-macos-arm64

# Test with simulated quarantine (browser download)
xattr -w com.apple.quarantine "0083;66a8b8e5;Safari;" qnsc-mcp-macos-arm64
chmod +x qnsc-mcp-macos-arm64
./qnsc-mcp-macos-arm64 --version
```

Expected output from `codesign -dv` should show:

- `Authority=Developer ID Application: <upstream vendor>` — the upstream cert; QNSC needs its own once this pipeline is rebuilt
- `flags=0x10000(runtime)` (hardened runtime enabled)
- `Timestamp=...` (signed with a trusted timestamp)

### Fallback Behavior

- If code signing secrets are not configured, the build falls back to ad-hoc signing
- If notarization secrets are not configured, the build skips notarization (signed but not notarized)
- Ad-hoc signed apps will show a Gatekeeper warning on first launch, but users can bypass it with right-click → Open
- Signed but not notarized apps may show a warning that the developer cannot be verified
