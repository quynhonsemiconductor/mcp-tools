#!/usr/bin/env bun
/**
 * build.ts - Build script using Bun.build() API
 *
 * Replaces the following scripts:
 * - build:prep:assets (copying encoder.json)
 * - build:prep (running generate:tools and generate:prompts)
 * - build:binary (using Bun.build() instead of command-line parameters)
 */
import { $ } from 'bun';
import { unzipSync, zipSync } from 'fflate';
import fs from 'fs';
import crypto from 'node:crypto';
import { cp } from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { manifestPath, tarPath } from '../src/gateway/extractor/mcp-extractor';
import { EmbeddedCredentialContextType } from '../src/services/auth';
import { bundleMCPsFromConfig } from './bundle-mcps';
import { collectSetupDocs, generateSetupModule } from './collect-setup-docs';
import { main as createMCPTarArchive } from './create-mcp-tars';

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const nodeModulesDir = path.join(rootDir, 'node_modules');

// Default build options
const defaultTarget = 'bun-darwin-arm64';
const defaultOutfile = 'qnsc-mcp';

/**
 * Main build function
 */
async function build() {
  try {
    // Parse command line arguments
    const args = parseArgs();

    // MCPB-only mode: package a binary that has already been built. The release
    // workflow signs the macOS binary between `build:binary` and this step so the
    // copy inside the .mcpb carries the Developer ID signature and hardened
    // runtime entitlements (entitlements.cli.plist). macOS 27 refuses to launch
    // the ad-hoc signed binary we used to ship in the .mcpb.
    if (args.mcpbOnly) {
      console.log('📦 Starting MCPB packaging (binary already built)...');
      args.targetVersion = await updateVersionInPackageJson(args.targetVersion);
      await packageMcpb(args);
      console.log('✅ MCPB packaging completed successfully!');
      return;
    }

    console.log('🏗️ Starting build process...');

    // if user provided a target version, update package.json, otherwise use existing version
    args.targetVersion = await updateVersionInPackageJson(args.targetVersion);

    // Step 1: Prep assets (copy encoder.json)
    await prepAssets();

    // Step 2: Generate tool and prompt loaders
    await generateLoaders();

    // Step 2.5: Collect and generate setup documentation
    await collectAndGenerateSetupDocs();

    // Step 3: Bundle MCP servers
    if (!args.noBundling) {
      await bundleMCPs(args.noSecurityScan, args.verbose);
    }

    // Step 3.5: Ensure keyring binding is installed for target platform
    await ensureKeyringBinding(args.target);

    // Step 4: Build the binary using Bun.build()
    await buildBinary(args);

    // Step 5: Package as MCPB, unless the caller defers it to a separate
    // `package:mcpb` run (the release workflows do, so the binary is signed first)
    if (!args.skipMcpb) {
      await packageMcpb(args);
    }

    console.log('✅ Build completed successfully!');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = {
    outfile: process.env.OUTFILE || defaultOutfile,
    target: process.env.TARGET || defaultTarget,
    minify: true,
    noSecurityScan: process.env.NO_SECURITY_SCAN ? true : false,
    noBundling: process.env.NO_BUNDLING ? true : false,
    verbose: process.env.VERBOSE ? true : false,
    skipMcpb: process.env.SKIP_MCPB ? true : false,
    mcpbOnly: process.env.MCPB_ONLY ? true : false,
    targetVersion: process.env.TARGET_VERSION || undefined
  };

  // Parse any command line arguments
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--outfile' && i + 1 < argv.length) {
      args.outfile = argv[++i];
    } else if (arg === '--target' && i + 1 < argv.length) {
      args.target = argv[++i];
    } else if (arg === '--no-minify') {
      args.minify = false;
    } else if (arg === '--no-security-scan') {
      args.noSecurityScan = true;
    } else if (arg === '--no-bundling') {
      args.noBundling = true;
    } else if (arg === '--verbose') {
      args.verbose = true;
    } else if (arg === '--skip-mcpb') {
      args.skipMcpb = true;
    } else if (arg === '--mcpb-only') {
      args.mcpbOnly = true;
    }
  }

  return args;
}

/**
 * Prepare assets for building
 */
async function prepAssets() {
  console.log('📦 Preparing assets for build...');

  await new Promise<void>((resolve, reject) => {
    if (!fs.existsSync('manifest.json.tmpl')) {
      reject(new Error('manifest.json.tmpl not found'));
      return;
    }
    cp('manifest.json.tmpl', 'manifest.json', (err) => {
      if (err) {
        console.error('Error copying manifest.json:', err);
        reject(err);
      } else {
        console.log('✅ Copied manifest.json.tmpl to manifest.json');
        resolve();
      }
    });
  });
}

/**
 * Generate tool and prompt loaders
 */
async function generateLoaders() {
  console.log('🔄 Generating tool and prompt loaders...');

  // Run generate:tools script
  await $`bun run ${path.join(rootDir, 'scripts', 'generate-tool-loader.js')}`;

  // Run generate:prompts script
  await $`bun run ${path.join(rootDir, 'scripts', 'generate-prompt-loader.js')}`;

  // Run generate:resources script
  await $`bun run ${path.join(rootDir, 'scripts', 'generate-resource-loader.js')}`;
}

/**
 * Collect and generate setup documentation module
 */
async function collectAndGenerateSetupDocs() {
  console.log('📚 Collecting setup documentation...');

  const docs = collectSetupDocs();
  console.log(`Found ${docs.length} setup documents`);

  const moduleContent = generateSetupModule(docs);

  const outputPath = path.join(rootDir, 'src', 'generated', 'setup-docs.ts');
  const outputDir = path.dirname(outputPath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, moduleContent, 'utf-8');
  console.log(`✅ Generated setup docs module: ${outputPath}`);
}

/**
 * Bundle MCP servers from configuration
 * @param skipSecurity Whether to skip security scanning
 */
async function bundleMCPs(
  skipSecurity: boolean = false,
  verbose: boolean = false
) {
  console.log('📦 Bundling MCP servers...');

  // Bundle MCPs from configuration
  await bundleMCPsFromConfig({ securityScan: !skipSecurity, verbose });

  // Run the docs generator
  const docsScriptPath = path.join(
    rootDir,
    'scripts',
    'generate-bundled-mcp-docs.ts'
  );

  console.log('📄 Generating documentation for bundled MCPs...');
  await $`bun ${docsScriptPath}`;
}

async function updateVersionInPackageJson(newVersion?: string) {
  const packageJsonFilePath = path.join(rootDir, 'package.json');

  if (!fs.existsSync(packageJsonFilePath)) {
    throw new Error(`package.json not found at path: ${packageJsonFilePath}`);
  }

  const packageJsonContent = fs.readFileSync(packageJsonFilePath, 'utf-8');
  const packageJson = JSON.parse(packageJsonContent);
  packageJson.version = newVersion ?? packageJson.version;

  fs.writeFileSync(
    packageJsonFilePath,
    JSON.stringify(packageJson, null, 2),
    'utf-8'
  );

  console.log(`✅ Updated package.json to version: ${packageJson.version}`);
  return packageJson.version;
}

const EMBEDDED_OAUTH_CLIENTS = ['github', 'entra'];
const EMBEDDED_GENERIC_SECRETS: string[] = [
  'RELEASES_TOKEN',
  'NEW_RELIC_LICENSE_KEY'
];

/**
 * XOR-obfuscate a string with the given key
 * @param plaintext - The string to obfuscate
 * @param key - The obfuscation key (Buffer)
 * @returns Base64-encoded obfuscated string
 */
function obfuscate(plaintext: string, key: Buffer): string {
  const data = Buffer.from(plaintext, 'utf-8');
  const result = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ key[i % key.length];
  }
  return result.toString('base64');
}

async function getEmbeddedCredentialDefines() {
  const defines: Record<string, string> = {};

  const obfuscationKey = crypto.randomBytes(32);
  const obfuscationKeyBase64 = obfuscationKey.toString('base64');

  const embeddedCredentialContext: EmbeddedCredentialContextType = {
    obfuscationKey: obfuscationKeyBase64,
    oAuthCredentials: {},
    genericSecrets: {}
  };

  for (const client of EMBEDDED_OAUTH_CLIENTS) {
    const clientUpper = client.toUpperCase();

    // Get {CLIENT}_CLIENT_ID and {CLIENT}_CLIENT_SECRET from env vars
    const clientIdEnv = process.env[`${clientUpper}_CLIENT_ID`];
    const clientSecretEnv = process.env[`${clientUpper}_CLIENT_SECRET`];

    if (!clientIdEnv || !clientSecretEnv) {
      console.warn(
        `Missing environment variables for ${clientUpper}: ${clientUpper}_CLIENT_ID or ${clientUpper}_CLIENT_SECRET, not embedding credentials.`
      );
      embeddedCredentialContext.oAuthCredentials![client] = {
        clientId: undefined,
        clientSecret: undefined
      };
      continue;
    }
    embeddedCredentialContext.oAuthCredentials![client] = {
      clientId: obfuscate(clientIdEnv, obfuscationKey),
      clientSecret: obfuscate(clientSecretEnv, obfuscationKey)
    };
  }

  for (const secretKey of EMBEDDED_GENERIC_SECRETS) {
    const secretEnv = process.env[secretKey.toUpperCase()];
    if (!secretEnv) {
      console.warn(
        `Missing environment variable for generic secret: ${secretKey.toUpperCase()}, not embedding secret.`
      );
      continue;
    }
    embeddedCredentialContext.genericSecrets![secretKey] = obfuscate(
      secretEnv,
      obfuscationKey
    );
  }

  defines['EMBEDDED_CREDENTIAL_CONTEXT'] = JSON.stringify(
    embeddedCredentialContext
  );
  return defines;
}

/**
 * Build the binary using Bun CLI
 */
async function buildBinary(args: {
  outfile: string;
  target: string;
  minify: boolean;
  noBundling: boolean;
  targetVersion?: string;
}) {
  console.log(
    `🔨 Building binary with target: ${args.target}, output: ${args.outfile}`
  );

  // Define entrypoint and assets
  const entrypoint = path.join(rootDir, 'src', 'bin', 'mcp.ts');
  const assets = [
    path.join(rootDir, 'public', 'index.html'),
    path.join(nodeModulesDir, 'gpt-3-encoder', 'vocab.bpe'),
    path.join(nodeModulesDir, 'gpt-3-encoder', 'encoder.json')
  ];

  // Add platform-specific keyring native binding
  const keyringBinding = getKeyringNativeBinding(args.target);
  if (keyringBinding && fs.existsSync(keyringBinding)) {
    assets.push(keyringBinding);
    console.log(
      `📦 Including keyring native binding: ${path.basename(keyringBinding)}`
    );
  } else if (keyringBinding) {
    console.warn(
      `⚠️ Keyring binding not found: ${keyringBinding}\n` +
        `   This should have been installed by ensureKeyringBinding(). The binary will not support OS credential storage.`
    );
  }

  // Add bundled MCPs as a single tar archive
  const bundledMCPsDir = path.join(rootDir, 'bundled-mcps');
  const mcpTarsDir = rootDir;
  const mcpsTarFullPath = path.join(mcpTarsDir, tarPath);
  const manifestFullPath = path.join(mcpTarsDir, manifestPath);

  // Ensure the bundled-mcps directory exists
  if (!fs.existsSync(bundledMCPsDir)) {
    console.log(`Creating bundled MCPs directory: ${bundledMCPsDir}`);
    fs.mkdirSync(bundledMCPsDir, { recursive: true });
  }
  // Create MCP tar files and add them to assets
  await createMCPTarArchive();

  // Only add tar file to assets if bundling is enabled and file exists
  // When NO_BUNDLING=true, the tar file may not be created
  if (!args.noBundling && fs.existsSync(mcpsTarFullPath)) {
    assets.push(mcpsTarFullPath);
  }
  assets.push(manifestFullPath);
  const jsonAssets = assets.filter((a) => a.endsWith('.json'));
  const jsonAssetRegex = new RegExp(
    `^(${jsonAssets.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`
  );

  try {
    const result = await Bun.build({
      entrypoints: [entrypoint, ...assets],
      naming: {
        asset: '[name].[ext]'
      },
      minify: args.minify,
      // Sourcemaps are intentionally omitted from the compiled binary. Inline
      // sourcemaps embed the full (highly compressible) source as base64 and
      // added ~16MB to the raw binary / ~9MB (16.5%) to the shipped .mcpb on
      // windows-x64, with no runtime consumer (no source-map-support /
      // prepareStackTrace) to justify the cost.
      sourcemap: 'none',
      compile: {
        target: args.target as any,
        outfile: args.outfile
      },
      define: {
        ...(await getEmbeddedCredentialDefines()),
        BUILD_ENVIRONMENT_TIER: (() => {
          const tier = process.env.BUILD_ENVIRONMENT_TIER || 'non-prod';
          console.log(`🌍 Build environment tier: ${tier}`);
          return JSON.stringify(tier);
        })(),
      },
      plugins: [
        // Override default JSON loader to load as a file asset
        {
          name: 'jsonRaw',
          setup(build) {
            build.onLoad({ filter: jsonAssetRegex }, async (args) => {
              console.log(`📄 Loading JSON asset as raw: ${args.path}`);
              const contents = await fs.promises.readFile(args.path, 'utf8');
              return {
                contents,
                loader: 'file'
              };
            });
          }
        }
      ]
    });

    if (!result.success) {
      throw new Error(`Build failed`);
    }

    // Make the output file executable if it exists
    if (fs.existsSync(args.outfile)) {
      fs.chmodSync(args.outfile, '755');
      console.log(`✅ Binary built successfully: ${args.outfile}`);
    } else {
      console.warn(
        `⚠️ Output file not found at expected location: ${args.outfile}`
      );
    }
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }

  try {
    // Only remove tar file if bundling was enabled and file exists
    if (!args.noBundling && fs.existsSync(mcpsTarFullPath)) {
      fs.unlinkSync(mcpsTarFullPath);
    }
  } catch (error) {
    console.warn(`⚠️ Error removing temporary files: ${error}`);
  }
}

/**
 * Package the binary as an MCPB file
 */
async function packageMcpb(args: {
  outfile: string;
  target: string;
  noBundling: boolean;
  targetVersion?: string;
}) {
  console.log(`📦 Packaging MCPB file from binary: ${args.outfile}`);

  const buildDir = 'mcp-build';
  const buildPath = path.join(rootDir, buildDir);

  try {
    // Verify binary exists
    if (!fs.existsSync(args.outfile)) {
      throw new Error(`Binary not found at: ${args.outfile}`);
    }

    // Create build directory
    if (fs.existsSync(buildPath)) {
      console.log(`🧹 Cleaning build directory: ${buildPath}`);
      fs.rmSync(buildPath, { recursive: true, force: true });
    }
    fs.mkdirSync(buildPath, { recursive: true });
    console.log(`✅ Created build directory: ${buildPath}`);

    // Copy binary to build directory
    const binaryFileName = path.basename(args.outfile);
    const destBinaryPath = path.join(buildPath, binaryFileName);
    fs.copyFileSync(args.outfile, destBinaryPath);
    console.log(`✅ Copied binary to: ${destBinaryPath}`);

    // Make binary executable (if not Windows)
    if (!binaryFileName.endsWith('.exe')) {
      fs.chmodSync(destBinaryPath, '755');
      console.log(`✅ Made binary executable`);
    }

    // Copy manifest.json
    const manifestSrc = path.join(rootDir, 'manifest.json');
    const manifestDest = path.join(buildPath, 'manifest.json');
    fs.copyFileSync(manifestSrc, manifestDest);
    console.log(`✅ Copied manifest.json`);

    // Copy icon
    const iconSrc = path.join(rootDir, 'public', 'qnsc-icon.png');
    const iconDest = path.join(buildPath, 'qnsc-icon.png');
    fs.copyFileSync(iconSrc, iconDest);
    console.log(`✅ Copied icon`);

    // Update manifest.json to point to the correct binary
    let manifestContent = fs.readFileSync(manifestDest, 'utf8');
    const manifestJson = JSON.parse(manifestContent);
    manifestJson.version = args.targetVersion || manifestJson.version;
    // Update the command in the manifest to point to the binary
    manifestJson.server.mcp_config.command = `\${__dirname}/${binaryFileName}`;

    fs.writeFileSync(manifestDest, JSON.stringify(manifestJson, null, 2));
    console.log(`✅ Updated manifest.json with binary path: ${binaryFileName}`);

    // Run mcpb pack
    console.log(`🔧 Running @anthropic-ai/mcpb pack...`);
    const bunPath = process.execPath;
    const mcpbProc = Bun.spawn([bunPath, 'x', '@anthropic-ai/mcpb', 'pack'], {
      cwd: buildPath,
      stdout: 'inherit',
      stderr: 'inherit',
      env: process.env
    });
    const mcpbExitCode = await mcpbProc.exited;
    if (mcpbExitCode !== 0) {
      throw new Error(`MCPB pack failed with exit code ${mcpbExitCode}`);
    }

    // Determine output MCPB filename based on target
    const mcpbFileName = getMcpbFileName(args.target, binaryFileName);
    const generatedMcpbPath = path.join(buildPath, 'mcp-build.mcpb');
    const finalMcpbPath = path.join(rootDir, mcpbFileName);

    if (!fs.existsSync(generatedMcpbPath)) {
      throw new Error(`MCPB file not generated at: ${generatedMcpbPath}`);
    }

    // Repack the .mcpb with STORED (uncompressed) entries.
    // Claude Desktop (1.12603.1, Node 24) silently hangs installing any .mcpb
    // with a deflate-compressed entry larger than ~16KB: its yauzl ->
    // createInflateRaw() pipeline deadlocks on backpressure. Our binary is one
    // ~45MB deflate entry, ~2800x over that threshold. STORED (method 0)
    // entries skip the broken inflate path entirely (verified against the
    // Desktop pipeline on Node 24.16.0). The bug is a Node-24 regression, not
    // OS-specific — confirmed on both Windows (anthropics/claude-code#67865)
    // and macOS (modelcontextprotocol/mcpb#279) — so we repack on every target.
    // mcpb pack hardcodes deflate level 9 with no opt-out, hence the repack.
    // Non-Windows binaries must keep their executable bit (fflate's unzip drops
    // entry attrs, so we re-apply it explicitly).
    const executableEntry = binaryFileName.endsWith('.exe')
      ? undefined
      : binaryFileName;
    repackMcpbAsStored(generatedMcpbPath, executableEntry);

    fs.renameSync(generatedMcpbPath, finalMcpbPath);
    console.log(`✅ MCPB file created: ${finalMcpbPath}`);

    // Cleanup build directory
    fs.rmSync(buildPath, { recursive: true, force: true });
    console.log(`🧹 Cleaned up build directory`);

    console.log(`\n🎉 Successfully packaged MCPB: ${mcpbFileName}`);
  } catch (error) {
    console.error('❌ Failed to package MCPB:', error);
    throw error;
  }
}

/**
 * Verify that the keyring binding is installed for the target platform
 */
async function ensureKeyringBinding(target: string): Promise<void> {
  const bindingPackages: Record<string, { pkg: string; nodeFile: string }> = {
    'bun-darwin-arm64': {
      pkg: '@napi-rs/keyring-darwin-arm64',
      nodeFile: 'keyring.darwin-arm64.node'
    },
    'bun-darwin-x64': {
      pkg: '@napi-rs/keyring-darwin-x64',
      nodeFile: 'keyring.darwin-x64.node'
    },
    'bun-linux-x64': {
      pkg: '@napi-rs/keyring-linux-x64-gnu',
      nodeFile: 'keyring.linux-x64-gnu.node'
    },
    'bun-linux-arm64': {
      pkg: '@napi-rs/keyring-linux-arm64-gnu',
      nodeFile: 'keyring.linux-arm64-gnu.node'
    },
    'bun-windows-x64': {
      pkg: '@napi-rs/keyring-win32-x64-msvc',
      nodeFile: 'keyring.win32-x64-msvc.node'
    }
  };

  const binding = bindingPackages[target];
  if (!binding) {
    console.log(`ℹ️  No keyring binding available for target: ${target}`);
    return;
  }

  // Check if the binding is already installed
  const bindingPath = getKeyringNativeBinding(target);
  if (bindingPath && fs.existsSync(bindingPath)) {
    console.log(`✅ Keyring binding already installed: ${binding.pkg}`);
    return;
  }

  let [, os, cpu] = target.split('-');
  if (os === 'windows') {
    os = 'win32';
  }

  throw new Error(
    `Could not find keyring binding for target ${target}, please run 'bun install --os ${os} --cpu ${cpu}' to install optional dependencies.`
  );
}

/**
 * Get the path to the platform-specific keyring native binding
 */
function getKeyringNativeBinding(target: string): string | null {
  const bindingMap: Record<string, string> = {
    'bun-darwin-arm64': path.join(
      nodeModulesDir,
      '@napi-rs',
      'keyring-darwin-arm64',
      'keyring.darwin-arm64.node'
    ),
    'bun-darwin-x64': path.join(
      nodeModulesDir,
      '@napi-rs',
      'keyring-darwin-x64',
      'keyring.darwin-x64.node'
    ),
    'bun-linux-x64': path.join(
      nodeModulesDir,
      '@napi-rs',
      'keyring-linux-x64-gnu',
      'keyring.linux-x64-gnu.node'
    ),
    'bun-linux-arm64': path.join(
      nodeModulesDir,
      '@napi-rs',
      'keyring-linux-arm64-gnu',
      'keyring.linux-arm64-gnu.node'
    ),
    'bun-windows-x64': path.join(
      nodeModulesDir,
      '@napi-rs',
      'keyring-win32-x64-msvc',
      'keyring.win32-x64-msvc.node'
    )
  };

  return bindingMap[target] || null;
}

/**
 * Repack a .mcpb archive in place using STORED (method 0, uncompressed) entries.
 *
 * Unzips every entry and rewrites the zip with `level: 0`, which fflate emits as
 * compression method 0. Entry bytes are preserved exactly (verified byte-identical
 * round-trip), so the manifest/binary/icon are unchanged — only the compression
 * method differs. This sidesteps the deflate-inflate deadlock in Claude Desktop's
 * unzip pipeline (anthropics/claude-code#67865). The file grows toward the raw
 * binary size since compression is removed.
 *
 * fflate's unzip discards each entry's external attributes, so the executable
 * bit must be re-applied explicitly: `executableEntry` names the entry (the
 * non-Windows binary) that should be marked mode 0755 so Desktop can launch it.
 */
function repackMcpbAsStored(mcpbPath: string, executableEntry?: string): void {
  console.log(`🗜️  Repacking MCPB with STORED (uncompressed) entries...`);
  const original = fs.readFileSync(mcpbPath);
  const entries = unzipSync(new Uint8Array(original));
  const stored = zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([name, data]) =>
        name === executableEntry
          ? [name, [data, { level: 0, os: 3, attrs: 0o755 << 16 }]]
          : [name, [data, { level: 0 }]]
      )
    ),
    { level: 0 }
  );
  fs.writeFileSync(mcpbPath, stored);
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
  console.log(
    `✅ Repacked as STORED: ${mb(original.length)}MB → ${mb(stored.length)}MB ` +
      `(${Object.keys(entries).length} entries, method 0)`
  );
}

/**
 * Generate MCPB filename based on target platform
 */
function getMcpbFileName(target: string, binaryFileName: string): string {
  // Map target to MCPB filename
  const targetMap: Record<string, string> = {
    'bun-darwin-arm64': 'qnsc-mcp-macos-arm64.mcpb',
    'bun-darwin-x64': 'qnsc-mcp-macos-x64.mcpb',
    'bun-linux-x64': 'qnsc-mcp-linux-x64.mcpb',
    'bun-linux-arm64': 'qnsc-mcp-linux-arm64.mcpb',
    'bun-windows-x64': 'qnsc-mcp-windows-x64.mcpb'
  };

  return targetMap[target] || `${binaryFileName}.mcpb`;
}

// Execute the build process
build();
