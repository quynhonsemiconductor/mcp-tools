#!/usr/bin/env bun

/**
 * bundle-mcps.ts - Script for bundling MCP servers from configuration files
 *
 * This script bundles multiple MCP servers based on configuration files in the bundled directory.
 */
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { rimraf } from 'rimraf';
import { fileURLToPath } from 'url';
import { MCPBatchBundler } from '../src/gateway/bundler/mcp-batch-bundler';
import { BundleMCPsOptions } from '../src/gateway/types/bundle';
import { displayError, displayHeader } from '../src/lib/display';

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

/**
 * Default MCP configuration directory
 */
const DEFAULT_CONFIG_DIR = path.join(rootDir, 'bundled');

/**
 * Default output directory for bundled MCPs
 */
const DEFAULT_OUTPUT_DIR = path.join(rootDir, 'bundled-mcps');

/**
 * Bundles MCP servers from configuration files
 * @param options Command options
 */
export async function bundleMCPsFromConfig(
  options: BundleMCPsOptions = {}
): Promise<void> {
  displayHeader();
  try {
    // Ensure MCP directory exists
    if (!fs.existsSync(DEFAULT_CONFIG_DIR)) {
      fs.mkdirSync(DEFAULT_CONFIG_DIR, { recursive: true });
      console.log(
        chalk.blue(`Created MCP configuration directory: ${DEFAULT_CONFIG_DIR}`)
      );
      console.log(
        chalk.yellow(
          `Add YAML files to this directory to define your MCP servers.`
        )
      );
      return;
    }

    if (options.mcpName) {
      console.log(
        chalk.blue(
          `🔄 Bundling MCP '${options.mcpName}' from configuration files in: ${DEFAULT_CONFIG_DIR}`
        )
      );
    } else {
      console.log(
        chalk.blue(
          `🔄 Bundling all MCPs from configuration files in: ${DEFAULT_CONFIG_DIR}`
        )
      );
    }
    console.log(chalk.blue(`📦 Output directory: ${DEFAULT_OUTPUT_DIR}`));

    // Clean output directory but keep .gitkeep
    if (fs.existsSync(DEFAULT_OUTPUT_DIR)) {
      rimraf.rimrafSync(DEFAULT_OUTPUT_DIR);
    }

    fs.mkdirSync(DEFAULT_OUTPUT_DIR, { recursive: true });

    // Create batch bundler
    const batchBundler = new MCPBatchBundler({
      configDir: DEFAULT_CONFIG_DIR,
      outputDir: DEFAULT_OUTPUT_DIR,
      verbose: options.verbose,
      securityScan: Boolean(options.securityScan)
    });

    if (options.securityScan) {
      console.log(chalk.blue(`🔒 Security scanning enabled`));
    }

    let results;
    if (options.mcpName) {
      // Bundle only the specified MCP
      // First, find the configuration for this MCP
      const configs = await batchBundler['configLoader'].loadAllConfigs();
      const mcpConfig = configs.find(
        (config) => (config.config.name || config.fileName) === options.mcpName
      );

      if (!mcpConfig) {
        throw new Error(
          `MCP with name '${options.mcpName}' not found in configuration files`
        );
      }

      // Bundle just this MCP
      const mcpName = mcpConfig.config.name || mcpConfig.fileName;
      const result = await batchBundler.bundleMCP(mcpConfig.config, mcpName);
      results = [result];
    } else {
      // Bundle all MCPs
      results = await batchBundler.bundleAll();
    }

    // Count successes and failures
    const successes = results.filter((result) => result.success);
    const failures = results.filter((result) => !result.success);

    // Print summary
    console.log(chalk.blue(`\n📊 Bundling Summary:`));
    console.log(chalk.green(`✅ Successfully bundled: ${successes.length}`));
    if (failures.length > 0) {
      console.log(chalk.red(`❌ Failed to bundle: ${failures.length}`));
    }

    // Print details of successful bundles
    if (successes.length > 0) {
      console.log(chalk.green(`\n✅ Successfully bundled MCPs:`));

      for (const result of successes) {
        console.log(chalk.green(`  - ${result.name}: ${result.path}`));

        // Print security scan results if available
        if (result.securityScan) {
          const riskScore = result.securityScan.riskScore;
          let riskColor;

          if (riskScore < 20) {
            riskColor = chalk.green;
          } else if (riskScore < 50) {
            riskColor = chalk.yellow;
          } else if (riskScore < 80) {
            riskColor = chalk.red;
          } else {
            riskColor = chalk.bgRed.white;
          }

          console.log(riskColor(`    Security Risk Score: ${riskScore}/100`));
          console.log(chalk.gray(`    ${result.securityScan.summary}`));

          if (result.securityScan.findings.length > 0) {
            console.log(
              chalk.yellow(
                `    Found ${result.securityScan.findings.length} security issues`
              )
            );
          } else {
            console.log(chalk.green(`    No security issues found`));
          }
        }
      }
    }

    // Print details of failed bundles
    if (failures.length > 0) {
      console.log(chalk.red(`\n❌ Failed to bundle MCPs:`));

      for (const result of failures) {
        console.log(chalk.red(`  - ${result.name}: ${result.error}`));
      }
    }

    // Generate documentation for the bundled MCPs
    try {
      // Check if the generate-bundled-mcp-docs.ts script exists
      const docsScriptPath = path.join(
        rootDir,
        'scripts',
        'generate-bundled-mcp-docs.ts'
      );
      if (fs.existsSync(docsScriptPath)) {
        console.log('\n📄 Generating documentation for bundled MCPs...');
        // Run the script directly using the Bun runtime
        const { spawn } = require('child_process');
        const docsProcess = spawn('bun', ['--silent', docsScriptPath], {
          stdio: 'inherit'
        });

        // Wait for the process to complete
        await new Promise<void>((resolve) => {
          docsProcess.on('close', () => {
            resolve();
          });
        });
      }
    } catch (error) {
      console.warn(`⚠️ Failed to generate documentation: ${error}`);
    }
  } catch (error) {
    displayError('Failed to bundle MCPs from configuration', error);
    throw error;
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(): BundleMCPsOptions {
  const args = process.argv.slice(2);
  const options: BundleMCPsOptions = { securityScan: true, verbose: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--no-security-scan') {
      options.securityScan = false;
    } else if (arg === '--mcp' || arg === '-m') {
      // The next argument should be the MCP name
      if (i + 1 < args.length) {
        options.mcpName = args[++i];
      } else {
        console.error('Error: --mcp option requires an MCP name argument');
        process.exit(1);
      }
    }
  }

  return options;
}

// Main function - parse args and run
async function main() {
  // Start the execution timer
  const startTime = performance.now();

  try {
    const options = parseArgs();
    await bundleMCPsFromConfig(options);
  } catch (error) {
    console.error(`❌ Failed to bundle MCPs: ${error}`);
    process.exit(1);
  } finally {
    // Calculate and display the elapsed time at the very end
    const endTime = performance.now();
    const elapsedTime = ((endTime - startTime) / 1000).toFixed(2);
    console.log(
      chalk.blue(`\n⏱️  Total execution time: ${elapsedTime} seconds`)
    );
  }
}

// Execute the script only if this file is run directly (not imported)
if (import.meta.main) {
  main();
}
