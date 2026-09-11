# Getting Started

This guide will help you set up QNSC MCP Toolkit so your AI assistant (like GitHub Copilot in VS Code or Claude Desktop) can access tools like CrUX, GitHub, and more. It assumes you are comfortable running a couple of commands in a terminal, since the toolkit currently runs from source.

!!! info "What is QNSC MCP Toolkit?"
    QNSC MCP Toolkit connects your AI assistant to tools like GitHub, CrUX, PostgreSQL, a knowledge graph and more. "MCP" stands for Model Context Protocol -- it is the standard that lets AI assistants use external tools. You do not need to understand how it works to use it.

## What You'll Need

- A computer running **Windows**, **macOS**, or **Linux**
- **VS Code** or **Claude Desktop** installed
- **[Bun](https://bun.sh) `>=1.3.11`** (the toolkit runs from source; see Step 1)
- About **15 minutes**

---

## Step 1: Get the Toolkit

There are no published installers or binaries yet — this repository has no releases or tags — so you run the toolkit from source with [Bun](https://bun.sh).

1. Install Bun (`>=1.3.11`) by following the instructions at [bun.sh](https://bun.sh). Verify it with `bun --version`.

2. Clone the repository and install dependencies. Open **PowerShell** on Windows or **Terminal** on macOS/Linux -- these are text-based interfaces where you type commands for your computer to run -- and run:

    ```bash
    git clone https://github.com/quynhonsemiconductor/mcp-tools.git
    cd mcp-tools
    bun install
    ```

!!! note "The command in this guide"
    Throughout this guide, the toolkit is invoked as `bun run src/mcp.ts` from inside the cloned `mcp-tools` folder. If you build a local binary with `bun run build:binary`, you can substitute `qnsc-mcp` for `bun run src/mcp.ts`. The binary is not code-signed, so macOS Gatekeeper will object to it.

---

## Step 2: Verify It Runs

From inside the `mcp-tools` folder, check the version:

```bash
bun run src/mcp.ts --version
```

**What you should see:** a version number.

You can also run the built-in diagnostics, which validate your config, environment variables, keyring, and TLS:

```bash
bun run src/mcp.ts doctor
```

---

## Step 3: Get a CrUX API Key

An API key is like a password that lets the toolkit access a service on your behalf. You only need keys for the services you plan to use. Let's start with the Chrome UX Report (CrUX) as an example.

1. Open the [Google Cloud Console](https://console.cloud.google.com) and select or create a project
2. Enable the **Chrome UX Report API**: go to **APIs & Services** > **Library**, search for "Chrome UX Report API", and click **Enable**
3. Go to **APIs & Services** > **Credentials**, click **Create credentials**, then choose **API key**
4. **Copy the key** -- you will use it in the next step

For more detail, see the [CrUX API documentation](https://developer.chrome.com/docs/crux/api).

!!! tip
    You only need API keys for the services you actually use. If you only use CrUX, that is the only key you need right now. See the [full API key guide](api-keys.md) for the other credentials this build uses (GitHub, Grafana k6, SwaggerHub, geocoding).

---

## Step 4: Choose Your AI Assistant

Which AI assistant will you be connecting to the toolkit?

=== "VS Code (GitHub Copilot)"

    Continue with **Step 5** below to configure VS Code.

=== "Claude Desktop"

    Follow the [Claude Desktop Setup Guide](clients/claude.md) for step-by-step instructions on connecting Claude Desktop to the toolkit.

    The API key you copied in Step 3 will be used during that setup. You can return to this page later if you also want to set up VS Code.

---

## Step 5: Set Up VS Code

Now you will tell VS Code how to connect to the toolkit.

1. Open **VS Code**

2. Open the **Command Palette** -- a search bar for VS Code commands:

    === "Windows"

        Press ++ctrl+shift+p++

    === "macOS"

        Press ++cmd+shift+p++

3. Type `MCP: Open User Configuration` and select it from the list

4. VS Code will open a file called `mcp.json`. This file may be empty or have some default content. Select all the text (++ctrl+a++ on Windows, ++cmd+a++ on macOS), delete it, and paste the following:

    ```json
    {
        "servers": {
            "qnsc-mcp": {
                "type": "stdio",
                "command": "bun",
                "args": ["run", "src/mcp.ts"],
                "cwd": "/absolute/path/to/mcp-tools",
                "env": {
                    "GOOGLE_CRUX_API_KEY": "${input:qnsc_mcp_crux_key}"
                }
            }
        },
        "inputs": [
            {
                "type": "promptString",
                "id": "qnsc_mcp_crux_key",
                "description": "Google CrUX API Key",
                "password": true
            }
        ]
    }
    ```

    !!! info "What does this do?"
        - `"command": "bun"` with `"args"` and `"cwd"` runs the toolkit from your cloned `mcp-tools` folder. Replace `/absolute/path/to/mcp-tools` with the real path where you cloned it. If you built a local binary, set `"command"` to its path (e.g. `qnsc-mcp`) and drop `"args"`/`"cwd"`.
        - `"env"` lists the API keys the toolkit needs. The `${input:...}` syntax means VS Code will ask you for the key when it starts, so you do not have to store it in the file.
        - `"inputs"` defines the prompt that asks for your Google CrUX API key.
        - The other lines (`"type"`, `"servers"`) are technical settings that you do not need to change.

    !!! tip "Windows paths"
        On Windows, write the `"cwd"` path with doubled backslashes (for example `"C:\\Users\\YourName\\mcp-tools"`) or forward slashes. In JSON, single backslashes cause a parse error.

5. **Save the file** (++ctrl+s++ on Windows, ++cmd+s++ on macOS)

!!! tip "Adding more tools later"
    This build's tools are native to the toolkit — you enable them by category in `config.yaml` (Step 6), not through a hosted gateway. Tools that need a credential (GitHub, Grafana k6, SwaggerHub, geocoding) take it from the `"env"`/`"inputs"` sections shown above. See the [full VS Code setup guide](clients/vs-code.md) for a complete configuration example.

---

## Step 6: Configure Your Tools

The toolkit uses a configuration file (a simple text file that controls settings) to know which tools to make available. Let's create one and enable CrUX.

1. Open PowerShell (Windows) or Terminal (macOS/Linux) again, in your `mcp-tools` folder

2. Run this command to generate the configuration file:

    ```bash
    bun run src/mcp.ts generate-config
    ```

3. Now open the configuration file in a text editor. In the PowerShell window run:

    === "Windows"

        ```powershell
        notepad $env:USERPROFILE\.qnscmcp\config.yaml
        ```

        (This is typically `C:\Users\YourName\.qnscmcp\config.yaml`)

        !!! note "Using Command Prompt instead of PowerShell?"
            Use this version instead: `notepad %USERPROFILE%\.qnscmcp\config.yaml`

    === "macOS / Linux"

        ```bash
        open ~/.qnscmcp/config.yaml
        ```

        (The `~` symbol means your home folder. If you see an error like "file does not exist," make sure you ran `bun run src/mcp.ts generate-config` first in Step 6.2.)

4. Delete everything in the file and replace it with the following:

    ```yaml
    tools:
      includeCategories:
        - 'CrUX'
    ```

    !!! info "What is YAML?"
        YAML is a simple text format for configuration files. The spacing matters -- use **two spaces** (not tabs) before each dash. The example above tells the toolkit to enable CrUX tools.

    !!! tip
        If you have trouble with spacing, you can also open this file in VS Code instead of Notepad or TextEdit. VS Code handles spaces more reliably. To do this, open VS Code, then go to **File > Open File** and navigate to the config file.

5. **Save and close** the file

!!! tip "Enable more tools later"
    You can add more tool categories anytime by editing this file. For example, to add GitHub and web tools:

    ```yaml
    tools:
      includeCategories:
        - 'CrUX'
        - 'Github: Issues'
        - 'Github: Pulls'
        - 'Utility'
    ```

    See the [Configuration Guide](../configuration.md) for all available categories and options.

---

## Step 7: Restart and Verify

1. **Quit VS Code completely** -- on Windows, close the window; on macOS, press ++cmd+q++ or click **Code > Quit Visual Studio Code** in the menu bar. Then reopen VS Code.
2. A text box will appear at the top of the VS Code window asking for your "Google CrUX API Key." Paste the key you copied in Step 3 and press ++enter++. If the prompt does not appear on startup, go to **MCP: List Servers**, start `qnsc-mcp` and the prompt will appear at that point.

    !!! note
        If you do not see `MCP: List Servers` as an option, make sure your VS Code is version **1.102 or later** (check under **Help > About**).

3. Look for confirmation that the toolkit is running:
    - Open the **Command Palette** (++ctrl+shift+p++ / ++cmd+shift+p++)
    - Type `MCP: List Servers`
    - You should see `qnsc-mcp` listed with a **Running** status

If you accidentally skip the token prompt or enter an incorrect value, the server will still show as **Running** but CrUX tools will be silently disabled. See [Skipped or Incorrect API Key Prompt](#skipped-or-incorrect-api-key-prompt) in Troubleshooting.

!!! failure "If the server is not running"
    1. Open the **Command Palette** (++ctrl+shift+p++ / ++cmd+shift+p++)
    2. Type `MCP: List Servers` and select it
    3. Click on `qnsc-mcp` in the list
    4. Choose **Start Server** from the menu

    If that does not work, check the Output panel (++ctrl+shift+u++ / ++cmd+shift+u++) and look for error messages from `qnsc-mcp`. Make sure your `config.yaml` file does not have any typos and uses the correct spacing.

---

## Step 8: Try It Out

Open **Copilot Chat** in VS Code -- click the chat icon in the left sidebar (it looks like a speech bubble), or press ++ctrl+shift+i++ (Windows) / ++cmd+shift+i++ (macOS).

Then try asking:

> _"What CrUX tools do you have available?"_

**What you should see:** Your AI assistant should respond with a list of CrUX-related tools, confirming that everything is connected and working.

**Note:** These tools are available in Copilot Chat only. The Claude VS Code extension requires separate configuration and will not show these tools.

Try a real request:

> _"Audit the Core Web Vitals for https://example.com"_

!!! success "Congratulations!"
    If you see results from CrUX, your setup is complete. The AI assistant can now use CrUX tools to help you with your work.

---

## Troubleshooting

### "command not found: bun" or the toolkit won't start

- Make sure [Bun](https://bun.sh) is installed and on your PATH: `bun --version` should print a version.
- Run the toolkit commands from **inside** the cloned `mcp-tools` folder, and make sure you ran `bun install` there first.
- In your `mcp.json`, check that `"cwd"` points at the absolute path of your `mcp-tools` folder.
- See the [Windows](windows.md), [macOS](macOS.md), or [Linux / WSL](linux.md) guides for platform-specific notes.

### Tools are not showing up in VS Code

- Make sure VS Code is version **1.102 or later**. Check by going to **Help** > **About**.
- Verify your `config.yaml` has at least one category enabled (see Step 6).
- Restart VS Code completely (close all windows, then reopen).

### Skipped or Incorrect API Key Prompt

If you accidentally skipped the token prompt or entered an incorrect value, VS Code caches the input and will not re-prompt — even after restarting. The server will still show as **Running**, but CrUX tools will be silently disabled.

To recover:

1. Open `mcp.json` via **Command Palette** → `MCP: Open User Configuration`
2. In the `"inputs"` array, rename the `"id"` of the CrUX key (e.g., `qnsc_mcp_crux_key` → `qnsc_mcp_crux_key_1`)
3. Update the matching `${input:qnsc_mcp_crux_key}` reference in the `"env"` section to use the new ID
4. Save — VS Code will stop the server automatically
5. Open **Command Palette** → `MCP: List Servers` and start `qnsc-mcp`
6. VS Code will prompt for the renamed input — enter the correct token


### API key is not working

- Make sure you copied the entire key with no extra spaces.
- Try generating a new key from the service's website.
- See the [API Key Setup guide](api-keys.md) for detailed instructions.

### Need more help?

- See the full [VS Code setup guide](clients/vs-code.md) for advanced configuration
- Check the [Configuration Guide](../configuration.md) for all available options
- Visit the [Discussions](https://github.com/quynhonsemiconductor/mcp-tools/discussions) for support

---

## Next Steps

- **Using multiple clients?** Follow the [Unified Setup Guide](unified-setup.md) to share a single set of API keys across Claude Code, Claude Desktop, VS Code Copilot, and VS Code Claude
- **Using Claude Desktop?** Follow the [Claude Desktop Setup Guide](clients/claude.md)
- **Add more credentials**: GitHub, Grafana k6, SwaggerHub and geocoding each unlock more tools — see the [API Key Setup guide](api-keys.md)
- **Explore all tool categories**: See the [Configuration Guide](../configuration.md) for the full list
- **Try other IDEs**: Set up with [JetBrains IDEs](clients/jetbrains.md) or [Claude Desktop](clients/claude.md)
