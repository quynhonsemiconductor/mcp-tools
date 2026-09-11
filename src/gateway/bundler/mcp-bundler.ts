/**
 * mcp-bundler.ts - Bundles third-party MCP servers with all dependencies
 *
 * This module handles bundling third-party MCP servers into single files that
 * can be loaded and executed in a sandboxed environment within the compiled binary.
 */
import { build } from 'bun';
import { execSync } from 'child_process';
import fs from 'fs';
import { mkdir, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import path, { basename, dirname, join } from 'path';
import { logError } from '../../services/logger';
import { logIf, warnIf } from '../../utils';
import {
  CompanionConfig,
  CompanionMetadata,
  DependencyAnalysisResult,
  MCPBundleOptions,
  MCPBundleResult,
  MCPMetadata,
} from '../types';
import { CloneResult, GitRepoSource } from '../types/bundle';
import { createBundleConfig } from './bundle-config';
import { DependencyAnalyzer } from './dependency-analyzer';
import { RepoCloner } from './repo-cloner';

/**
 * Minimal shape of package.json fields this module reads.
 */
interface PackageJsonShape {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
}

/**
 * MCPBundler handles bundling third-party MCP servers with all their dependencies
 * into single files that can be executed in a sandbox environment.
 */
export class MCPBundler {
  private dependencyAnalyzer: DependencyAnalyzer;
  // Per-bundle state shared across the private helper methods invoked while
  // bundleMCP() is running. These are typed instance fields (rather than
  // `(this as any)._current*`) so downstream reads are type-checked.
  private currentOptions?: MCPBundleOptions;
  private currentCloneResult?: CloneResult;
  private currentMetadata?: MCPMetadata;

  constructor() {
    this.dependencyAnalyzer = new DependencyAnalyzer();
  }

  /**
   * Bundle an MCP server with all its dependencies
   * @param options Bundling options
   * @returns Bundle result
   */
  public async bundleMCP(options: MCPBundleOptions): Promise<MCPBundleResult> {
    const {
      mcpName,
      mcpSource,
      buildProject = true,
      minify = true,
      sourceMaps = false,
      verbose = false,
      staticFiles = [],
    } = options;

    this.currentOptions = options;

    const packageTitle =
      typeof mcpSource === 'string' ? mcpSource : `${mcpSource.url}@${mcpSource.ref}`;

    logIf(`🔍 Preparing MCP from ${packageTitle}`, verbose);

    const cloneResult = await this.prepareSource(mcpSource, buildProject, verbose);
    if (!cloneResult.success) {
      throw new Error(`Failed to prepare source: ${cloneResult.error}`);
    }

    // Store the clone result for later use in buildProject
    this.currentCloneResult = cloneResult;

    const mcpDir = cloneResult.path;

    try {
      const outputPath = options.outputPath || this.getDefaultOutputPath(mcpDir);
      await mkdir(dirname(outputPath), { recursive: true });

      // Use workingDir from cloneResult if available for dependency analysis
      const analyzeDir = cloneResult?.workingDir || mcpDir;

      const analysisResult = await this.dependencyAnalyzer.analyzeDependencies(analyzeDir);

      const entryPoint = options.entryPoint || analysisResult.entryPoint;

      if (!entryPoint) {
        throw new Error(
          `No entry point found in ${mcpName} MCP source. Please specify an entry point using the 'entryPoint' option.`,
        );
      }

      logIf(`📄 Using entry point: ${entryPoint}`, verbose);
      logIf(
        `📦 Found ${Object.keys(analysisResult.declaredDependencies).length} declared dependencies`,
        verbose,
      );
      logIf(`🔍 Found ${analysisResult.sourceImports.size} source imports`, verbose);
      logIf(`📝 Detected module format: ${analysisResult.moduleFormat}`, verbose);

      let format: 'esm' | 'cjs' | 'iife' = 'cjs';

      // If the entry point file contains ESM imports, try ESM format
      // Only use ESM format for pure ESM modules, use CJS for both pure CJS and mixed formats
      if (analysisResult.moduleFormat === 'esm') {
        format = 'esm';
        logIf(`📚 Using ESM format for pure ESM module source`, verbose);
      } else if (analysisResult.moduleFormat === 'mixed') {
        format = 'cjs';
        logIf(`📚 Using CommonJS format for mixed module source for better compatibility`, verbose);
      } else {
        logIf(`📚 Using CommonJS format for CJS module source`, verbose);
      }

      logIf(
        `📊 Module format details: detected=${analysisResult.moduleFormat}, using bundle format=${format}`,
        verbose,
      );

      if (format === 'cjs') {
        logIf(`📚 Using CJS format with import.meta.url replacement`, verbose);
      } else if (format === 'esm') {
        logIf(`📚 Using ESM format, leaving import.meta.url intact`, verbose);
      }

      // Use the proper directory for the entryPoint
      const entryPointDir = cloneResult?.workingDir || mcpDir;

      const bundleConfig = createBundleConfig(
        join(entryPointDir, entryPoint),
        outputPath,
        packageTitle,
        {
          minify,
          sourceMaps,
          format,
          verbose: verbose,
          external: options.external,
          security: options.security
            ? {
                allowFileSystem: options.security.allowFileSystem,
                allowedPaths: options.security.allowedPaths,
                allowNetwork: options.security.allowNetwork,
                networkAllowlist: options.security.networkAllowlist,
              }
            : undefined,
        },
      );

      try {
        const entryPointPath = join(mcpDir, entryPoint);

        logIf(`🔨 Bundling MCP...`, verbose);
        try {
          let result;

          // If startFunction is specified, append the auto-start code to the entry point file
          if (options.startFunction) {
            try {
              const originalContent = fs.readFileSync(entryPointPath, 'utf8');
              const autoStartCode = `

// --- MCP Auto-Start Code (Added by MCP Bundler) ---
// This code was automatically added to ensure the MCP starts when loaded
try {
  // Call the specified function directly - it's in the same file
  if (typeof ${options.startFunction} === 'function') {
    ${options.startFunction}();
  } else if (typeof exports && typeof exports.${options.startFunction} === 'function') {
    // As a fallback, try it as an export
    exports.${options.startFunction}();
  }
} catch (e) {
  console.error('Error in MCP auto-start code:', e);
}
// --- End MCP Auto-Start Code ---
`;

              fs.writeFileSync(entryPointPath, originalContent + autoStartCode);

              logIf(
                `✅ Added auto-start code for function ${options.startFunction} to entry point`,
                verbose,
              );
            } catch (error) {
              logError(`❌ Failed to add auto-start code: ${String(error)}`, verbose);
            }
          }

          try {
            bundleConfig.throw = true;

            const outDir = bundleConfig.outdir;
            // list contents of outDir
            if (outDir && fs.existsSync(outDir)) {
              const files = fs.readdirSync(outDir);
              logIf(`📂 Output directory contents: ${files.join(', ')}`, verbose);
            } else {
              warnIf(`📂 Output directory does not exist: ${outDir ?? '(unset)'}`, verbose);
            }

            result = await build(bundleConfig);
            if (result.logs.length > 0) {
              console.warn('Build succeeded with warnings:');
              for (const message of result.logs) {
                console.warn(message);
              }
            }
          } catch (buildError) {
            const error = buildError as AggregateError;
            console.error('❌ Bun Build Failed');
            console.error(error);

            throw buildError;
          }

          if (fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            console.log(`✅ Output file size: ${stats.size} bytes`);
          } else {
            console.error(`❌ Output file not created: ${outputPath}`);
            throw new Error(`Output file not created: ${outputPath}`);
          }
        } catch (bundleError) {
          console.error(
            'Bun build error details:',
            bundleError instanceof Error ? bundleError.message : String(bundleError),
          );
          console.error(
            'Bun build error stack:',
            bundleError instanceof Error ? bundleError.stack : 'No stack available',
          );

          if (verbose) {
            throw new Error('Bundling failed!');
          }

          const outputDir = dirname(outputPath);
          fs.mkdirSync(outputDir, { recursive: true });
          fs.copyFileSync(entryPointPath, outputPath);

          if (verbose) {
            const stats = fs.statSync(outputPath);
            console.log(`✅ Output file size: ${stats.size} bytes`);
          }
        }
      } catch (error) {
        console.error(
          'Bun build error details:',
          error instanceof Error ? error.message : String(error),
        );
        console.error(
          'Bun build error stack:',
          error instanceof Error ? error.stack : 'No stack available',
        );

        if (verbose) {
          console.error('\n🔍 DETAILED ERROR ANALYSIS:');

          const entryPointPath = join(mcpDir, entryPoint);
          console.error(`Entry point check: ${entryPointPath}`);
          if (!fs.existsSync(entryPointPath)) {
            console.error('❌ Entry point file does not exist!');
          } else {
            console.error('✅ Entry point file exists');
            try {
              const content = fs.readFileSync(entryPointPath, 'utf8').slice(0, 200);
              console.error(`Entry point content preview: ${content}...`);

              if (content.includes('import.meta.url')) {
                console.error('⚠️ File contains import.meta.url which might cause issues');
              }

              // Check ESM vs CJS
              if (content.includes('import ')) {
                console.error('ℹ️ File appears to use ESM imports');
              }
              if (content.includes('require(')) {
                console.error('ℹ️ File appears to use CommonJS requires');
              }
            } catch (readError) {
              console.error(`❌ Could not read entry point file: ${String(readError)}`);
            }
          }

          try {
            const outputDir = dirname(outputPath);
            const testFile = join(outputDir, `test-${Date.now()}.txt`);
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
            console.error('✅ Output directory is writable');
          } catch (fsError) {
            console.error(`❌ Output directory issue: ${String(fsError)}`);
          }

          console.error('📦 Full bundle config:', JSON.stringify(bundleConfig, null, 2));
        }

        throw error;
      }

      logIf(`✅ Bundle created at ${outputPath}`, verbose);

      const metadata = await this.extractMetadata(
        mcpName,
        mcpDir,
        entryPoint,
        analysisResult,
        mcpSource,
      );

      const bundle = await readFile(outputPath, 'utf8');

      logIf(
        `🔒 Security applied through plugins for: ${JSON.stringify(options.security)}`,
        verbose && !!options.security,
      );

      metadata.bundleSize = bundle.length;
      const outputDir = dirname(outputPath);
      this.copyResourceDirectories(mcpDir, outputDir, verbose);

      if (staticFiles && staticFiles.length > 0) {
        this.copyStaticFiles(mcpDir, outputDir, staticFiles, verbose);
      }

      if (options.companions) {
        logIf(`Number of companions: ${options.companions.length}`, verbose);
        logIf(
          `Companions to process: ${options.companions.map((c) => c.name).join(', ')}`,
          verbose,
        );
      }

      // Handle companions if defined
      if (options.companions && options.companions.length > 0) {
        logIf(`🔄 Processing ${options.companions.length} companion servers...`, verbose);

        const companions: CompanionMetadata[] = [];

        for (const companion of options.companions) {
          try {
            const companionMetadata = await this.bundleCompanion(companion, mcpDir, verbose);
            companions.push(companionMetadata);

            logIf(`📄 Companion ${companion.name} has been bundled to correct location`, verbose);

            console.log(`✅ Bundled companion: ${companion.name}`);
          } catch (error) {
            console.warn(`⚠️ Failed to bundle companion ${companion.name}: ${String(error)}`);
          }
        }

        // Add companions to metadata
        if (companions.length > 0) {
          metadata.companions = companions;
        }
      }

      if (options.envVars) {
        metadata.envVars = options.envVars;
      }

      if (options.security) {
        metadata.security = {
          allowNetwork:
            options.security.allowNetwork !== undefined ? options.security.allowNetwork : false,
          allowFileSystem:
            options.security.allowFileSystem !== undefined
              ? options.security.allowFileSystem
              : false,
          allowedPaths: options.security.allowedPaths,
          networkAllowlist: options.security.networkAllowlist,
        };
      }

      this.currentMetadata = metadata;

      // Return the bundled result

      return {
        bundle,
        metadata,
        outputDir,
        sourceRepoPath: mcpDir,
        cloneResult,
      };
    } catch (error) {
      if (cloneResult.shouldCleanup) {
        RepoCloner.cleanup(cloneResult);
      }
      console.error(
        `❌ Bundling failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Prepares the source directory
   * @param source Source repository URL or directory
   * @param build Whether to build the project
   * @param verbose Whether to show verbose output
   * @returns Clone result
   */
  private async prepareSource(
    source: string | GitRepoSource,
    build: boolean,
    verbose: boolean,
  ): Promise<CloneResult> {
    const cloneResult = await RepoCloner.cloneRepo(source, verbose);

    if (!cloneResult.success) {
      return {
        ...cloneResult,
        success: false,
        error: `Failed to clone repository: ${cloneResult.error}`,
        shouldCleanup: cloneResult.shouldCleanup,
      };
    }

    if (build) {
      try {
        // Pass build command from options if available
        const buildCommand = this.currentOptions?.buildCommand;
        // Pass cloneResult directly to buildProject
        this.buildProject(cloneResult.path, verbose, buildCommand, cloneResult);
      } catch (error) {
        return {
          ...cloneResult,
          success: false,
          error: `Failed to build project: ${error instanceof Error ? error.message : String(error)}`,
          shouldCleanup: cloneResult.shouldCleanup,
        };
      }
    }

    return cloneResult;
  }

  /**
   * Builds the MCP project
   * @param sourceDir Source directory
   * @param verbose Whether to show verbose output
   */
  private buildProject(
    sourceDir: string,
    verbose: boolean,
    buildCommand?: string,
    passedCloneResult?: CloneResult,
  ): void {
    if (verbose) {
      logIf(`Building project from directory: ${sourceDir}`, true);
    }

    // Declare variables we'll use throughout the method
    let cloneResult: CloneResult | undefined;
    let workDir: string;
    let packageJsonPath: string;
    let packageJson: PackageJsonShape;

    // Use workingDir from cloneResult if available
    try {
      cloneResult = passedCloneResult || this.currentCloneResult;
      workDir = cloneResult?.workingDir || sourceDir;

      if (cloneResult?.workingDir) {
        logIf(`📂 Using working directory for build: ${workDir}`, verbose);
      }

      let packageJsonFound = false;
      packageJsonPath = join(workDir, 'package.json');

      if (fs.existsSync(packageJsonPath)) {
        packageJsonFound = true;
      }

      if (!packageJsonFound) {
        throw new Error(`package.json not found in working directory: ${workDir}`);
      }

      // Parse package.json
      packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageJsonShape;
    } catch (error) {
      throw new Error(
        `Failed to access working directory: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    logIf(`📦 Installing dependencies...`, verbose);

    try {
      execSync(`bun install ${verbose ? '--silent' : ''}`, {
        cwd: workDir!,
        stdio: verbose ? 'inherit' : 'ignore',
      });
    } catch (error) {
      throw new Error(
        `Failed to install dependencies: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    let builtSuccessfully = false;

    if (buildCommand) {
      logIf(`🔨 Running build command from server.yaml: ${buildCommand}`, verbose);

      try {
        execSync(buildCommand, {
          cwd: workDir!,
          stdio: verbose ? 'inherit' : 'ignore',
        });
        builtSuccessfully = true;
        logIf(`✅ Build command from server.yaml succeeded`, verbose);
      } catch (error) {
        console.warn(
          `Warning: Failed to run build command from server.yaml: ${error instanceof Error ? error.message : String(error)}`,
        );
        logIf(`⚠️ Falling back to standard build scripts`, verbose);
      }
    }

    // If no custom build command or it failed, try various build scripts
    if (!builtSuccessfully) {
      const buildAttempts = [
        { script: 'prepublish', message: 'Running prepublish script' },
        { script: 'build', message: 'Building project using build script' },
        { script: 'compile', message: 'Compiling project' },
      ];

      for (const buildAttempt of buildAttempts) {
        if (packageJson.scripts && packageJson.scripts[buildAttempt.script]) {
          logIf(`🔨 ${buildAttempt.message}`, verbose);

          try {
            execSync(`bun run ${buildAttempt.script}`, {
              cwd: workDir!,
              stdio: verbose ? 'inherit' : 'ignore',
            });
            builtSuccessfully = true;
            break;
          } catch (error) {
            console.warn(
              `Warning: Failed to run ${buildAttempt.script}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }
    }

    if (!builtSuccessfully) {
      const tsconfigPath = join(sourceDir, 'tsconfig.json');
      if (fs.existsSync(tsconfigPath)) {
        logIf(`🔨 No build script succeeded, attempting to compile TypeScript manually`, verbose);
        try {
          execSync('npx tsc', {
            cwd: workDir!,
            stdio: verbose ? 'inherit' : 'ignore',
          });
          builtSuccessfully = true;
        } catch (error) {
          console.warn(
            `Warning: Manual TypeScript compilation failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    logIf(
      `ℹ️ No build script succeeded or found, proceeding without build`,
      !builtSuccessfully && verbose,
    );
  }

  /**
   * Get default output path for a bundled MCP
   * @param mcpDir Directory containing the MCP
   * @returns Default output path
   */
  private getDefaultOutputPath(mcpDir: string): string {
    const mcpName = basename(mcpDir);
    const outputDir = join(tmpdir(), `${mcpName}-bundle`);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    return join(outputDir, 'index.js');
  }

  /**
   * Copies resource directories from the build directory to the bundle directory
   * @param sourceDir Source directory containing the MCP
   * @param outputDir Output directory for the bundle
   * @param verbose Whether to show verbose output
   */
  private copyResourceDirectories(sourceDir: string, outputDir: string, verbose: boolean): void {
    try {
      // We need to determine the build directory from the entry point
      const metadata = this.getMetadata();
      if (!metadata || !metadata.entryPoint) {
        warnIf(`⚠️ No entry point found in metadata, skipping directory copy`, verbose);
        return;
      }

      // Get the clone result which might have workingDir
      const cloneResult = this.currentCloneResult;
      const workDir = cloneResult?.workingDir || sourceDir;

      // Calculate build path using the proper base directory
      const buildPath = path.dirname(path.join(workDir, metadata.entryPoint));

      logIf(`📁 Copying from build directory: ${buildPath}`, verbose);

      const dirsToSkip = ['node_modules', '.git'];
      const entries = fs.readdirSync(buildPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory() || dirsToSkip.includes(entry.name)) {
          continue;
        }

        const sourcePath = path.join(buildPath, entry.name);
        const destPath = path.join(outputDir, entry.name);

        logIf(`📂 Copying directory: ${entry.name}`, verbose);

        if (!fs.existsSync(destPath)) {
          fs.mkdirSync(destPath, { recursive: true });
        }

        this.copyDirectoryRecursive(sourcePath, destPath, verbose);
      }

      // Copy resources for companions if they exist
      if (metadata.companions && metadata.companions.length > 0) {
        for (const companion of metadata.companions) {
          try {
            // Determine companion build path
            const companionEntryPath = path.dirname(path.join(sourceDir, companion.bundlePath));
            const companionBuildDir = path.dirname(companionEntryPath);

            // Calculate destination directory
            const companionDestDir = path.join(outputDir, '..', path.dirname(companion.bundlePath));

            logIf(
              `📁 Copying companion resources from: ${companionBuildDir} to ${companionDestDir}`,
              verbose,
            );

            // Create destination directory if it doesn't exist
            if (!fs.existsSync(companionDestDir)) {
              fs.mkdirSync(companionDestDir, { recursive: true });
            }

            // Copy resource directories for the companion
            if (fs.existsSync(companionBuildDir)) {
              const companionEntries = fs.readdirSync(companionBuildDir, {
                withFileTypes: true,
              });

              for (const entry of companionEntries) {
                if (!entry.isDirectory() || dirsToSkip.includes(entry.name)) {
                  continue;
                }

                const sourcePath = path.join(companionBuildDir, entry.name);
                const destPath = path.join(companionDestDir, entry.name);

                logIf(`📂 Copying companion directory: ${entry.name}`, verbose);

                if (!fs.existsSync(destPath)) {
                  fs.mkdirSync(destPath, { recursive: true });
                }

                this.copyDirectoryRecursive(sourcePath, destPath, verbose);
              }
            }
          } catch (error) {
            warnIf(
              `⚠️ Error copying companion resources: ${error instanceof Error ? error.message : String(error)}`,
              verbose,
            );
          }
        }
      }
    } catch (error) {
      warnIf(
        `⚠️ Error copying resource directories: ${error instanceof Error ? error.message : String(error)}`,
        verbose,
      );
    }
  }

  /**
   * Gets the current metadata - should be called after extractMetadata
   */
  private getMetadata(): MCPMetadata | null {
    return this.currentMetadata || null;
  }

  /**
   * Recursively copies a directory
   * @param source Source directory
   * @param destination Destination directory
   * @param verbose Whether to show verbose output
   */
  private copyDirectoryRecursive(source: string, destination: string, verbose: boolean): void {
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    const entries = fs.readdirSync(source, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        if (!fs.existsSync(destPath)) {
          fs.mkdirSync(destPath, { recursive: true });
        }
        this.copyDirectoryRecursive(srcPath, destPath, verbose);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * Helper method to copy a static file with support for source:dest format
   * @param baseDir Base directory to resolve source path against
   * @param outputDir Base directory to resolve destination path against
   * @param staticFileEntry Static file entry (can be file path or source:dest format)
   * @param verbose Whether to show verbose output
   * @param isCompanion Whether this is a companion static file (for logging)
   */
  private copyStaticFileEntry(
    baseDir: string,
    outputDir: string,
    staticFileEntry: string,
    verbose: boolean,
    isCompanion: boolean = false,
  ): void {
    const hasCustomDestination = staticFileEntry.includes(':');

    let sourcePath: string;
    let destinationPath: string;

    if (hasCustomDestination) {
      // Split the entry into source and destination parts
      const [sourceFile, destFile] = staticFileEntry.split(':', 2);
      sourcePath = path.join(baseDir, sourceFile);

      // For custom destinations, we need to be careful about path duplication
      // If the outputDir already ends with a directory that matches the start of destFile,
      // we should avoid creating nested directories
      const outputDirName = path.basename(outputDir);
      const destFileDir = path.dirname(destFile);

      if (destFileDir !== '.' && outputDirName === destFileDir) {
        // The outputDir already contains the destination directory, so use the file name only
        destinationPath = path.join(outputDir, path.basename(destFile));
      } else {
        // Use the destFile path as-is with the outputDir
        destinationPath = path.join(outputDir, destFile);
      }
    } else {
      // Use the same path for both source and destination
      sourcePath = path.join(baseDir, staticFileEntry);

      // For non-custom destinations, we maintain the same path structure
      destinationPath = path.join(outputDir, staticFileEntry);
    }

    // Ensure destination directory exists
    const destDir = path.dirname(destinationPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    if (fs.existsSync(sourcePath)) {
      try {
        fs.copyFileSync(sourcePath, destinationPath);
      } catch (error) {
        console.error(
          `❌ ERROR copying static file: ${error instanceof Error ? error.message : String(error)}`,
        );

        try {
          const stats = fs.statSync(sourcePath);
          console.error(
            `  - Source stats: ${JSON.stringify({
              isFile: stats.isFile(),
              isDirectory: stats.isDirectory(),
              size: stats.size,
              permissions: stats.mode,
            })}`,
          );
        } catch (statError) {
          console.error(
            `  - Error getting source stats: ${statError instanceof Error ? statError.message : String(statError)}`,
          );
        }
      }
    } else {
      warnIf(`⚠️ ${isCompanion ? 'Companion ' : ''}static file not found: ${sourcePath}`, verbose);
      console.error(`⚠️ Static file not found: ${sourcePath}`);
      console.error(`  - File entry: ${staticFileEntry}`);
      console.error(`  - Base dir: ${baseDir}`);
      console.error(
        `  - Entries in base dir: ${fs.existsSync(baseDir) ? fs.readdirSync(baseDir).join(', ') : 'dir not found'}`,
      );
    }
  }

  /**
   * Copy static files from the source directory to the output directory
   * @param sourceDir Source directory containing the MCP
   * @param outputDir Output directory for the bundle
   * @param staticFiles List of static files to copy
   * @param verbose Whether to show verbose output
   */
  private copyStaticFiles(
    sourceDir: string,
    outputDir: string,
    staticFiles: string[],
    verbose: boolean,
  ): void {
    if (!staticFiles || staticFiles.length === 0) {
      return;
    }

    try {
      logIf(`📄 Copying ${staticFiles.length} static files to the bundle`, verbose);

      // Get metadata for companions
      const metadata = this.getMetadata();
      const hasCompanions = metadata?.companions && metadata.companions.length > 0;

      for (const filePath of staticFiles) {
        // Get the clone result which might have workingDir
        const cloneResult = this.currentCloneResult;
        const workDir = cloneResult?.workingDir || sourceDir;

        const mcpRootDir = outputDir;

        // We'll use mcpRootDir directly for copying static files
        // This allows files to be copied to the directory structure specified
        // in the static file entries

        // Make sure mcpRootDir exists
        if (!fs.existsSync(mcpRootDir)) {
          fs.mkdirSync(mcpRootDir, { recursive: true });
        }
        // Use the helper method to copy the file
        this.copyStaticFileEntry(workDir, mcpRootDir, filePath, verbose, false);
      }

      // Handle static files for companions
      if (hasCompanions) {
        for (const companion of metadata.companions!) {
          try {
            // Extract companion name from bundlePath
            const bundlePathParts = companion.bundlePath.split('/');
            if (bundlePathParts.length >= 2 && bundlePathParts[0] === 'companions') {
              // Try to copy package.json for the companion
              const companionWorkDir = path.join(
                sourceDir,
                path.dirname(companion.bundlePath.replace('companions/', '')),
              );
              const companionPkgPath = path.join(companionWorkDir, 'package.json');

              if (fs.existsSync(companionPkgPath)) {
                // Create companion output directory
                const companionOutDir = path.join(
                  outputDir,
                  '..',
                  path.dirname(companion.bundlePath),
                );
                if (!fs.existsSync(companionOutDir)) {
                  fs.mkdirSync(companionOutDir, { recursive: true });
                }

                // Copy package.json to the companion directory
                const destPath = path.join(companionOutDir, 'package.json');
                fs.copyFileSync(companionPkgPath, destPath);

                logIf(
                  `📄 Copied companion package.json for ${companion.name} to ${destPath}`,
                  verbose,
                );
              } else {
                logIf(`⚠️ Companion package.json not found at: ${companionPkgPath}`, verbose);
              }

              if (companion.staticFiles && companion.staticFiles.length > 0) {
                logIf(
                  `📄 Copying ${companion.staticFiles.length} static files for companion ${companion.name}`,
                  verbose,
                );

                for (const staticFileEntry of companion.staticFiles) {
                  // Create companion output directory
                  const companionDestDir = path.join(
                    outputDir,
                    '..',
                    path.dirname(companion.bundlePath),
                  );

                  // Use the helper method to copy the file
                  this.copyStaticFileEntry(
                    companionWorkDir,
                    companionDestDir,
                    staticFileEntry,
                    verbose,
                    true,
                  );
                }
              }
            }
          } catch (error) {
            warnIf(
              `⚠️ Error copying companion static files: ${error instanceof Error ? error.message : String(error)}`,
              verbose,
            );
          }
        }
      }
    } catch (error) {
      warnIf(
        `⚠️ Error copying static files: ${error instanceof Error ? error.message : String(error)}`,
        verbose,
      );
    }
  }

  /**
   * Build and bundle a companion server
   * @param companion Companion configuration
   * @param mcpDir Directory containing the MCP
   * @param verbose Whether to show verbose output
   * @returns Companion metadata
   */
  private async bundleCompanion(
    companion: CompanionConfig,
    mcpDir: string,
    verbose: boolean,
  ): Promise<CompanionMetadata> {
    // Resolve companion working directory
    const companionDir = join(mcpDir, companion.workingDir);

    // Check if companion directory exists
    if (!fs.existsSync(companionDir)) {
      throw new Error(`Companion directory not found: ${companionDir}`);
    }

    // Install dependencies for the companion
    try {
      logIf(`📦 Installing dependencies for companion ${companion.name}...`, verbose);
      execSync(`bun install ${verbose ? '--silent' : ''}`, {
        cwd: companionDir,
        stdio: verbose ? 'inherit' : 'ignore',
      });
    } catch (error) {
      throw new Error(
        `Failed to install dependencies for companion ${companion.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Build the companion if enabled
    if (companion.build?.enabled) {
      try {
        const buildCmd = companion.build.command || 'npm run build';
        logIf(`🔨 Building companion ${companion.name}...`, verbose);

        execSync(buildCmd, {
          cwd: companionDir,
          stdio: verbose ? 'inherit' : 'ignore',
        });
      } catch (error) {
        throw new Error(
          `Failed to build companion ${companion.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Analyze dependencies
    const analysisResult = await this.dependencyAnalyzer.analyzeDependencies(companionDir);

    // Get version
    let version = '0.0.0';
    try {
      const packageJsonPath = join(companionDir, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, 'utf8'),
        ) as PackageJsonShape;
        if (packageJson.version) {
          version = packageJson.version;
        }
      }
    } catch {
      // Intentionally ignored: fall back to the default version above if
      // the companion's package.json is missing or malformed.
    }

    // Create a distinct bundlePath that includes the companion name as a subdirectory
    // This ensures companions don't overwrite the main MCP files
    const companionSubdir = companion.name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();

    // Define the output directory directly in bundled-mcps structure
    // Get the bundled-mcps directory
    const bundledMcpsDir = join(process.cwd(), 'bundled-mcps');
    // bundleCompanion is only invoked from within bundleMCP, after currentOptions is set.
    const mcpOutputDir = join(bundledMcpsDir, this.currentOptions!.mcpName);
    const companionOutputDir = join(mcpOutputDir, 'companions', companionSubdir);
    const companionEntryDir = dirname(companion.entrypoint);
    const companionOutputEntryDir = join(companionOutputDir, companionEntryDir);

    // Make sure output directory exists
    if (!fs.existsSync(companionOutputEntryDir)) {
      fs.mkdirSync(companionOutputEntryDir, { recursive: true });
      logIf(`📁 Created directory for companion: ${companionOutputEntryDir}`, verbose);
    }

    // Setup the bundle output path for the companion
    const companionEntryPointPath = join(companionDir, companion.entrypoint);
    const outputPath = join(companionOutputDir, companion.entrypoint);

    logIf(`🔨 Bundling companion ${companion.name} with bun build...`, verbose);
    logIf(`- Entry point: ${companionEntryPointPath}`, verbose);
    logIf(`- Output path: ${outputPath}`, verbose);

    // Create directory structure for the output path if it doesn't exist
    if (!fs.existsSync(dirname(outputPath))) {
      fs.mkdirSync(dirname(outputPath), { recursive: true });
    }

    // Determine the format (esm or cjs)
    let format: 'esm' | 'cjs' | 'iife' = 'cjs';
    if (analysisResult.moduleFormat === 'esm') {
      format = 'esm';
      logIf(`📚 Using ESM format for companion bundle`, verbose);
    } else {
      logIf(`📚 Using CommonJS format for companion bundle`, verbose);
    }

    // Create bundle config just like we do for MCPs
    const bundleConfig = createBundleConfig(
      companionEntryPointPath,
      outputPath,
      `${companion.name}@${version}`,
      {
        minify: true,
        sourceMaps: false,
        format,
        verbose: verbose,
      },
    );

    // Bundle using bun build
    let bundleSuccess = false;
    try {
      const result = await build(bundleConfig);

      if (result.logs.length > 0) {
        console.warn('Companion build succeeded with warnings:');
        for (const message of result.logs) {
          console.warn(message);
        }
      }

      bundleSuccess = true;
      logIf(`✅ Companion bundle created at ${outputPath}`, verbose);

      // Copy any resource directories that might be needed, similar to MCPs
      this.copyCompanionResources(companionDir, companionOutputDir, companion.entrypoint, verbose);
    } catch (error) {
      console.error(
        `❌ Companion bundling failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      // If bundling fails, fall back to copying the file directly
      if (fs.existsSync(companionEntryPointPath)) {
        console.warn(`Falling back to direct file copy for companion...`);
        try {
          fs.copyFileSync(companionEntryPointPath, outputPath);
          logIf(`📄 Copied companion ${companion.name} entry point to: ${outputPath}`, verbose);
          bundleSuccess = true;
        } catch (copyError) {
          console.error(
            `❌ Failed to copy companion entry point as fallback: ${copyError instanceof Error ? copyError.message : String(copyError)}`,
          );
        }
      }
    }

    // Always copy package.json since it might contain important metadata
    const packageJsonPath = join(companionDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJsonDestPath = join(companionOutputDir, 'package.json');
      try {
        fs.copyFileSync(packageJsonPath, packageJsonDestPath);
        logIf(`📄 Copied companion package.json to ${packageJsonDestPath}`, verbose);
      } catch (pkgError) {
        console.error(
          `❌ Failed to copy package.json: ${pkgError instanceof Error ? pkgError.message : String(pkgError)}`,
        );
      }
    }

    // Copy static files defined in the companion config
    if (companion.staticFiles && companion.staticFiles.length > 0) {
      logIf(
        `📄 Copying ${companion.staticFiles.length} static files for companion ${companion.name}...`,
        verbose,
      );

      // The companionDir is the full path including workingDir
      // We need to resolve static files relative to the companionDir
      for (const staticFileEntry of companion.staticFiles) {
        // Use the helper method to copy the file
        this.copyStaticFileEntry(companionDir, companionOutputDir, staticFileEntry, verbose, true);
      }
    }

    if (bundleSuccess) {
      logIf(`✅ Successfully bundled companion: ${companion.name}`, verbose);
    } else {
      throw new Error(`Failed to bundle companion ${companion.name}`);
    }

    const companionMetadata: CompanionMetadata = {
      name: companion.name,
      description: companion.description,
      entryPoint: companion.entrypoint,
      bundlePath: join('companions', companionSubdir, companion.entrypoint),
      dependencies: analysisResult.declaredDependencies,
      moduleFormat: analysisResult.moduleFormat,
      version: version,
      staticFiles: companion.staticFiles,
    };

    return companionMetadata;
  }

  /**
   * Copy resource directories for a companion
   * Similar to copyResourceDirectories but specific for companions
   */
  private copyCompanionResources(
    companionDir: string,
    outputDir: string,
    entryPoint: string,
    verbose: boolean,
  ): void {
    try {
      // Calculate build path based on the entry point directory
      const buildPath = path.dirname(path.join(companionDir, entryPoint));
      logIf(`📁 Copying companion resources from: ${buildPath}`, verbose);

      const dirsToSkip = ['node_modules', '.git'];
      const entries = fs.readdirSync(buildPath, { withFileTypes: true });

      for (const entry of entries) {
        // Skip directories we don't want to copy
        if (entry.isDirectory() && dirsToSkip.includes(entry.name)) {
          continue;
        }

        const sourcePath = path.join(buildPath, entry.name);
        const destPath = path.join(outputDir, path.dirname(entryPoint), entry.name);

        // Skip the entry point file itself since it's already handled
        if (sourcePath === path.join(companionDir, entryPoint)) {
          continue;
        }

        // Copy file or directory
        if (entry.isDirectory()) {
          if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath, { recursive: true });
          }
          this.copyDirectoryRecursive(sourcePath, destPath, verbose);
          logIf(`📁 Copied companion directory: ${entry.name}`, verbose);
        } else {
          // Ensure the destination directory exists
          if (!fs.existsSync(path.dirname(destPath))) {
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
          }
          fs.copyFileSync(sourcePath, destPath);
          logIf(`📄 Copied companion file: ${entry.name}`, verbose);
        }
      }
    } catch (error) {
      warnIf(
        `⚠️ Error copying companion resources: ${error instanceof Error ? error.message : String(error)}`,
        verbose,
      );
    }
  }

  /**
   * Extract metadata from analysis result
   * @param mcpName Name of the MCP
   * @param mcpDir Directory containing the MCP
   * @param entryPoint Entry point file
   * @param analysisResult Analysis result
   * @param mcpSource Original MCP source
   * @returns Metadata
   */
  private async extractMetadata(
    mcpName: string,
    mcpDir: string,
    entryPoint: string,
    analysisResult: DependencyAnalysisResult,
    mcpSource: string | GitRepoSource,
  ): Promise<MCPMetadata> {
    let version = '0.0.0';

    // Try to get version from package.json
    try {
      const packageJsonPath = join(mcpDir, 'package.json');
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as PackageJsonShape;

      if (packageJson.version) {
        version = packageJson.version;
      }
    } catch {
      // Intentionally ignored: fall back to the default version above if
      // package.json is missing or malformed.
    }

    const args = this.currentOptions?.args;

    const metadata: MCPMetadata = {
      name: mcpName,
      version,
      entryPoint,
      dependencies: analysisResult.declaredDependencies,
      bundleSize: 0,
      moduleFormat: analysisResult.moduleFormat,
      args: args,
    };

    if (typeof mcpSource !== 'string') {
      metadata.source = {
        repository: mcpSource.url,
        ref: mcpSource.ref,
      };
    }

    this.currentMetadata = metadata;

    return metadata;
  }
}
