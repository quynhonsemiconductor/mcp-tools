# QNSC-MCP Installer

A cross-platform GUI installer for QNSC-MCP built with Electron.

## Features

- Native GUI installation wizard for Windows, macOS, and Linux
- Automatic elevation prompts for system directories
- Configurable installation path
- Optional PATH modification
- Automatic config generation after install

## Building

### Prerequisites

```bash
cd installer
npm install
```

### Build for Current Platform

```bash
npm run dist
```

### Build for Specific Platforms

```bash
# Windows (NSIS installer)
npm run dist:win

# macOS (DMG)
npm run dist:mac

# Linux (AppImage)
npm run dist:linux

# All platforms (cross-compile from Linux)
npm run dist:all
```

### Cross-Compilation from Linux

To build all platform installers from a Linux CI runner:

```bash
# Install required dependencies for cross-compilation
sudo dpkg --add-architecture i386
sudo apt-get update
sudo apt-get install -y wine64 wine32 rpm

# Build all platforms
npm run dist:all
```

## Output

Built installers are placed in the `release/` directory:

- `qnsc-mcp-installer-win-x64.exe` - Windows NSIS installer (x64)
- `qnsc-mcp-installer-macos-x64.dmg` - macOS disk image (Intel)
- `qnsc-mcp-installer-macos-arm64.dmg` - macOS disk image (Apple Silicon)
- `qnsc-mcp-installer-linux-x64.AppImage` - Linux AppImage (x64)
- `qnsc-mcp-installer-linux-arm64.AppImage` - Linux AppImage (ARM64)

## How It Works

1. When run, the installer detects the user's platform and architecture
2. User selects installation directory (defaults to system location)
3. Installer fetches the latest release info from GitHub Enterprise
4. Binary is downloaded with progress tracking
5. Installer requests elevated privileges if needed
6. Binary is installed and made executable
7. PATH is optionally updated
8. `qnsc-mcp generate-config` is run automatically

The installer downloads binaries at runtime using an embedded releases token,
ensuring users always get the latest version without needing to configure
GitHub authentication.

## CI Integration

The installer is built as part of the release workflow. The `inject-oauth-credentials.ts`
script injects the releases token into the installer source before building.

## Development

```bash
# Run in development mode
npm start

# Build TypeScript
npm run build
```

## Icons

Place platform-specific icons in the `assets/` directory:

- `icon.icns` - macOS icon
- `icon.png` - Windows and Linux icon (512x512)

Note: We use PNG for Windows instead of ICO. electron-builder automatically converts
PNG to ICO during build. This simplifies asset management without quality loss.

## Dependencies

### Electron Version

We use Electron 40.x which provides:
- Modern Chromium with latest security patches
- Native ARM64 support for Apple Silicon
- Improved performance and smaller bundle size

This version was chosen for stability with electron-builder cross-compilation.

## Security Notes

### Token Obfuscation

The embedded releases token uses XOR obfuscation (not encryption) to prevent
casual inspection in the binary. This is intentional - it's meant to avoid
accidental token exposure in string dumps, not to provide cryptographic security.
See `src/utils.ts` for implementation details.
