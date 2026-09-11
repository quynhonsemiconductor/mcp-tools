# macOS

## Run from source (current install path)

There are no published installers or binaries yet — this repository has no releases or tags — so on macOS you run the toolkit from source with [Bun](https://bun.sh).

### 1. Install Bun

Install [Bun](https://bun.sh) `>=1.3.11` and confirm it:

```bash
bun --version
```

### 2. Clone and install

Open Terminal (press ++cmd+space++, type `Terminal`, and press ++enter++), then:

```bash
git clone https://github.com/quynhonsemiconductor/mcp-tools.git
cd mcp-tools
bun install
```

### 3. Verify it runs

```bash
bun run src/mcp.ts --version
bun run src/mcp.ts doctor        # validate config, env, keyring, TLS
```

## Building a local binary (optional)

If you want a single `qnsc-mcp` executable instead of running through Bun, build one:

```bash
bun run build:binary
```

This produces a macOS arm64/x64 binary. It is **not** code-signed or notarized, so macOS Gatekeeper will block it on first run. Clear the quarantine flag before using it:

```bash
xattr -d com.apple.quarantine ./qnsc-mcp
```

!!! note
    QNSC's release pipeline does not sign or notarize binaries yet (see [Release Process](../development/RELEASE-PROCESS.md)), so expect this Gatekeeper step whenever you build locally. Once you have a binary on your PATH you can substitute `qnsc-mcp` for `bun run src/mcp.ts` in the commands below.

## Initial Configuration

Generate your configuration file (a text file that controls which tools are enabled):

```bash
bun run src/mcp.ts generate-config
```

This creates `~/.qnscmcp/config.yaml` (the `~` symbol means your home folder). To open the config file, type the following in Terminal:

```bash
open ~/.qnscmcp/config.yaml
```

Edit it to enable the tool categories you need. Category names must match [`TOOLS.md`](https://github.com/quynhonsemiconductor/mcp-tools/blob/main/TOOLS.md) exactly:

```yaml
tools:
  includeCategories:
    - 'CrUX'
    - 'Github: Issues'
    - 'Github: Pulls'
    - 'Github: Repos'
    - 'Github: Search'
    - 'Utility'
```

See the [Configuration Guide](../configuration.md) for all available options.

## Next Steps

1. **Set up your IDE** (your code editor, such as VS Code) - follow the guide for your editor:
    - [VS Code](clients/vs-code.md)
    - [JetBrains IDEs](clients/jetbrains.md) (WebStorm, IntelliJ, PyCharm, etc.)
    - [Claude Desktop & Claude Code](clients/claude.md)

2. **Configure API keys** (secret tokens that let the toolkit access services on your behalf) for the services you want to use:
    - [API Key Setup](api-keys.md)
