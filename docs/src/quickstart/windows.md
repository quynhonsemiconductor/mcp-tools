# Windows

## Run from source (current install path)

There are no published installers or binaries yet — this repository has no releases or tags — so on Windows you run the toolkit from source with [Bun](https://bun.sh).

### 1. Install Bun

Install [Bun](https://bun.sh) `>=1.3.11` (the site provides a PowerShell one-liner). Then, in a **new** PowerShell window, confirm it:

```powershell
bun --version
```

### 2. Clone and install

```powershell
git clone https://github.com/quynhonsemiconductor/mcp-tools.git
cd mcp-tools
bun install
```

### 3. Verify it runs

```powershell
bun run src/mcp.ts --version
bun run src/mcp.ts doctor
```

## Building a local binary (optional)

If you want a single `qnsc-mcp.exe` instead of running through Bun, build one:

```powershell
bun run build:binary:windows
```

The executable is not code-signed. Once it is on your PATH you can substitute `qnsc-mcp` for `bun run src/mcp.ts` in the commands below.

## Initial Configuration

Generate your configuration file (a text file that controls which tools are enabled). In PowerShell, from your `mcp-tools` folder, run:

```powershell
bun run src/mcp.ts generate-config
```

This creates `%USERPROFILE%\.qnscmcp\config.yaml` (typically `C:\Users\YourName\.qnscmcp\config.yaml`). Open it in Notepad:

```powershell
notepad $env:USERPROFILE\.qnscmcp\config.yaml
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

---

## Windows Troubleshooting

### Keeping the toolkit up to date

Because you run from source, update by pulling the latest code and reinstalling dependencies from your `mcp-tools` folder:

```powershell
git pull
bun install
```

If you built a local binary, rebuild it afterward with `bun run build:binary:windows`.

### Path Format in JSON Configuration

When you point your IDE at the toolkit, the `"cwd"` (repo path) in JSON (a text format used for configuration files) must use escaped backslashes or forward slashes:

```json
"cwd": "C:\\Users\\YourName\\mcp-tools"
```

or:

```json
"cwd": "C:/Users/YourName/mcp-tools"
```

!!! warning
    Single backslashes (`C:\Users\...`) will cause JSON parse errors.

### Common Configuration Mistakes

| Mistake | Problem | Solution |
|---------|---------|----------|
| Single backslashes in paths | JSON parse error | Use `\\` or `/` |
| Missing commas between objects | JSON parse error | Add comma after each property |
| Comments in JSON | JSON parse error | Remove `//` comments |
| Incorrect environment variable names | Tools fail silently | Check [`TOOLS.md`](https://github.com/quynhonsemiconductor/mcp-tools/blob/main/TOOLS.md) for correct names |
| Hardcoded secrets | Security risk | Use `${input:...}` syntax |

### Server Won't Start

| Symptom | Possible Cause | Solution |
|---------|---------------|----------|
| "command not found: bun" | Bun not installed or not on PATH | Install Bun, open a new terminal |
| Server exits immediately | Not run from the repo folder | `cd` into `mcp-tools` and run `bun install` |
| "Access denied" | Insufficient permissions | Run IDE as Administrator |
| Errors reading config | Malformed `config.yaml` | Run `bun run src/mcp.ts doctor` |

### Validating Your Configuration

```powershell
# Test if mcp.json is valid JSON
Get-Content "$env:APPDATA\Code\User\mcp.json" | ConvertFrom-Json

# Verify config.yaml exists
Test-Path "$env:USERPROFILE\.qnscmcp\config.yaml"

# Diagnose config, env, keyring and TLS
bun run src/mcp.ts doctor
```
