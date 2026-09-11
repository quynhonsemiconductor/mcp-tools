# Bundler Plugins

## ‼️ Bundler plugins are currently disabled due to conflicts between ESM/CJS/Mixed

This directory contains plugins used during the bundling process for MCP servers.

## Filesystem Security Plugin

The `fs-security-plugin.ts` implements a build-time solution for filesystem security in MCP servers. It intercepts all `fs` and `fs/promises` imports during the build process and replaces them with a secure shim module.

### How it works

1. If `allowFileSystem` is true and no `allowedPaths` are specified:
   - The plugin doesn't intercept any filesystem imports
   - Original Node.js filesystem module is used directly
   - No performance overhead or compatibility issues

2. Otherwise, the plugin intercepts all imports of `fs` and `fs/promises` modules during the bundling process and:
   - Blocks all filesystem operations if `allowFileSystem` is false
   - Restricts operations to the paths specified in `allowedPaths` if provided

### Advantages over runtime security

This build-time approach offers several advantages over the previous runtime security implementation:

1. **Comprehensive Coverage**
   - Intercepts ALL filesystem access, including direct imports
   - Works with both ESM and CommonJS modules
   - Handles various import patterns (default, named, namespace)

2. **Build-time vs. Runtime**
   - Applies security during bundling rather than at runtime
   - No dependencies on runtime hacks or global object manipulation
   - No race conditions between imports and security implementation

3. **Maintainability**
   - Clean, focused implementation in the build pipeline
   - No complex runtime detection of module systems
   - Easier to test and validate

### Configuration

The plugin is configured via the `security` options in the MCP bundler:

```typescript
createBundleConfig(entryPoint, outputFile, packageTitle, {
  // ... other options
  security: {
    allowFileSystem: false, // Block all filesystem operations
    allowedPaths: [
      "CWD",                  // Allow access to current working directory
      "/path/to/allowed/dir", // Allow access to a specific directory
      "{{TEMP}}/mysubdir",    // Use template vars for dynamic paths (TEMP, HOME, CWD)
      "HOME"                  // Allow access to user's home directory
    ]
  }
});
```

### Path Resolution

The `allowedPaths` option supports:

1. **Absolute paths**
   - Direct filesystem paths (e.g., `/var/data`)
   - Access is granted to the specified path and all its subdirectories

2. **Magic words**
   - `CWD`: Current working directory of the process
   - `TEMP` or `TMP`: System temporary directory
   - `HOME`: User's home directory

3. **Template variables**
   - `{{CWD}}`: Replaced with the current working directory
   - `{{TEMP}}` or `{{TMP}}`: Replaced with the system temp directory
   - `{{HOME}}`: Replaced with the user's home directory
   - Examples: `{{CWD}}/data`, `{{TEMP}}/downloads`

When a filesystem operation is attempted, the path is resolved to its absolute path and checked against all allowed paths. Access is granted if the path is exactly an allowed path or is a subdirectory of an allowed path.

## Network Security Plugin

The `network-security-plugin.ts` implements a build-time solution for network security in MCP servers. It restricts network access to allowed hosts.

### Configuration

```typescript
createBundleConfig(entryPoint, outputFile, packageTitle, {
  // ... other options
  security: {
    allowNetwork: false, // Block all network operations
    networkAllowlist: [
      "api.example.com",       // Allow access to specific domain
      "*.data.example.org",    // Support wildcards
      "https://api.github.com" // Protocol can be specified
    ]
  }
});
```