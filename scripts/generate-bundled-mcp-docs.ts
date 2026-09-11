#!/usr/bin/env bun

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { METADATA_FILENAME } from '../src/gateway/bundled-mcp-manager';
import { BundledMCPInfo } from '../src/gateway/types/bundle';

// Get the directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const bundledMcpsDir = path.join(rootDir, 'bundled');
const mcpDocsDir = path.join(rootDir, 'bundled');
/**
 * Generates documentation for bundled MCP servers
 */
async function generateBundledMCPDocs(): Promise<BundledMCPInfo[]> {
  console.log('📄 Generating documentation for bundled MCP servers...');

  try {
    // Check if bundled-mcps directory exists
    if (!fs.existsSync(bundledMcpsDir)) {
      console.error(`❌ Bundled MCPs directory not found: ${bundledMcpsDir}`);
      process.exit(1);
    }

    // Get all subdirectories in the bundled MCPs directory
    const subdirs = fs
      .readdirSync(bundledMcpsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory() && dirent.name !== '.git')
      .map((dirent) => dirent.name);

    console.log(`Found ${subdirs.length} bundled MCP servers`);

    // Collect MCPs information
    const mcps: BundledMCPInfo[] = [];
    let totalTools = 0;

    for (const dir of subdirs) {
      try {
        // Check if this directory contains an MCP bundle
        const metadataPath = path.join(bundledMcpsDir, dir, METADATA_FILENAME);
        const serverYamlPath = path.join(bundledMcpsDir, dir, 'server.yaml');

        // Skip if metadata doesn't exist
        if (!fs.existsSync(metadataPath)) {
          console.warn(`⚠️ No ${METADATA_FILENAME} found for ${dir}, skipping`);
          continue;
        }

        // Skip if build is disabled in server.yaml
        if (fs.existsSync(serverYamlPath)) {
          try {
            const yaml = require('js-yaml');
            const serverConfig = yaml.load(
              fs.readFileSync(serverYamlPath, 'utf8')
            );
            if (
              serverConfig &&
              serverConfig.build &&
              serverConfig.build.enabled === false
            ) {
              console.log(
                `⚠️ Skipping ${dir} because build.enabled is false in server.yaml`
              );
              continue;
            }
          } catch (yamlError) {
            console.warn(`⚠️ Error parsing server.yaml for ${dir}:`, yamlError);
          }
        }

        // Read and parse metadata
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

        // Add to the list
        mcps.push(metadata);
        totalTools += metadata.tools?.length || 0;

        // Generate markdown for this MCP
        await generateMCPDocumentation(metadata, dir);
      } catch (error) {
        console.error(`❌ Error processing MCP ${dir}:`, error);
      }
    }

    // Update bundled README with all MCPs information
    await updateBundledReadme(mcps);

    console.log(
      `✅ Documentation generated for ${mcps.length} MCPs with ${totalTools} total tools`
    );

    // Return the MCPs information for potential further processing
    return mcps;
  } catch (error) {
    console.error('❌ Error generating documentation:', error);
    process.exit(1);
  }
}

/**
 * Generates markdown documentation for a single MCP
 * @param mcp MCP info
 * @param dirName Directory name
 */
async function generateMCPDocumentation(
  mcp: any,
  dirName: string
): Promise<void> {
  const mdFilePath = path.join(path.join(mcpDocsDir, dirName), 'README.md');
  fs.mkdirSync(path.join(mcpDocsDir, dirName), { recursive: true });

  // Create a markdown file for this MCP
  let markdown = `# ${mcp.name}\n\n`;
  markdown += `**Version:** ${mcp.version}\n\n`;

  const repo = mcp.source?.repository?.split('.com/')[1] || '';
  markdown += `<a href="https://glama.ai/mcp/servers/${repo}">View on Glama.ai</a>\n\n`;
  // glamai is blocking external images, so we can't use the badge :(
  // markdown += `<img width="380" height="200" src="https://glama.ai/mcp/servers/${repo}/badge" /></a>\n\n`;
  markdown += `**Source:** [${mcp.source?.repository}](${mcp.source?.repository}) (${mcp.source?.ref})\n\n`;

  // Add environment variables if available
  if (mcp.envVars && mcp.envVars.length > 0) {
    markdown += `## Environment Variables\n\n`;
    markdown += `| Name | Description | Required | Default |\n`;
    markdown += `| ---- | ----------- | -------- | ------- |\n`;

    for (const env of mcp.envVars) {
      const description = env.description || '';
      const required = env.required ? '✅' : '❌';
      const defaultValue = env.default || '';

      markdown += `| \`${env.name}\` | ${description} | ${required} | ${defaultValue} |\n`;
    }

    markdown += '\n';
  }

  // Add tools
  markdown += `## Tools\n\n`;

  if (mcp.tools && mcp.tools.length > 0) {
    for (const tool of mcp.tools) {
      markdown += `### ${tool.name}\n\n`;
      markdown += `${tool.description || 'No description provided.'}\n\n`;
    }
  } else {
    markdown += `This MCP does not provide any tools.\n\n`;
  }

  // Add markdown rule
  markdown += `---\n\n`;

  const securityScanPath = path.join(mcpDocsDir, dirName, 'security-scan.json');
  if (fs.existsSync(securityScanPath)) {
    try {
      const securityScan = JSON.parse(
        fs.readFileSync(securityScanPath, 'utf8')
      );
      markdown += `## Security Scan Results\n\n`;
      markdown += `**Security Risk Score:** ${securityScan.riskScore}/100 ([View Security Scan](./security-scan.json))\n\n`;
      markdown += `### Summary of Findings\n\n`;
      markdown += (securityScan.summary || 'No summary provided.') + '\n';

      // Add all findings in detail
      if (securityScan.findings && securityScan.findings.length > 0) {
        markdown += `\n### All Security Findings\n\n`;
        markdown += `| Category | Risk Level | Description | Recommendation |\n`;
        markdown += `| -------- | ---------- | ----------- | -------------- |\n`;

        for (const finding of securityScan.findings) {
          // Format category name for display
          const displayCategory = finding.category
            .split('_')
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

          markdown += `| ${displayCategory} | ${finding.riskLevel.toUpperCase()} | ${finding.description} | ${finding.recommendation} |\n`;
        }
      }

      // Add security categories table
      if (securityScan.securityCategories) {
        markdown += `\n### Security Categories Assessment\n\n`;
        markdown += `| Category | Risk Level | Score |\n`;
        markdown += `| -------- | ---------- | ----- |\n`;

        // Sort categories by score descending
        const sortedCategories = Object.entries(
          securityScan.securityCategories
        ).sort((a, b) => (b[1] as any).score - (a[1] as any).score);

        for (const [category, data] of sortedCategories) {
          // Format category name for display
          const displayCategory = category
            .split('_')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

          markdown += `| ${displayCategory} | ${(data as any).riskLevel.toUpperCase()} | ${(data as any).score}/100 |\n`;
        }
      }

      // Add highest risk categories if any are medium or higher
      const highRiskCategories = Object.entries(securityScan.securityCategories)
        .filter(([_, data]: [string, any]) =>
          ['medium', 'high', 'critical'].includes(data.riskLevel)
        )
        .sort((a: [string, any], b: [string, any]) => b[1].score - a[1].score)
        .slice(0, 3);

      if (highRiskCategories.length > 0) {
        markdown += `\n### Key Security Findings\n\n`;
        markdown += `| Risk Category | Risk Level | Score |\n`;
        markdown += `| ------------- | ---------- | ----- |\n`;

        for (const [category, data] of highRiskCategories) {
          // Format category name for display
          const displayCategory = category
            .split('_')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

          markdown += `| ${displayCategory} | ${(data as any).riskLevel.toUpperCase()} | ${(data as any).score}/100 |\n`;
        }
      }
    } catch (error) {
      console.warn(`⚠️ Error processing security scan for ${dirName}:`, error);
      markdown += `- **Security Scan:** Error processing security scan\n`;
    }
  } else {
    markdown += `- **Security Scan:** Not Available\n`;
  }

  fs.writeFileSync(mdFilePath, markdown);
}

/**
 * Updates the bundled README.md file with MCP information
 * @param mcps List of MCP info
 */
async function updateBundledReadme(mcps: BundledMCPInfo[]): Promise<void> {
  try {
    // Filter out MCPs with build.enabled: false
    // MCPs are already filtered during collection

    const readmePath = path.join(rootDir, 'bundled', 'README.md');

    // Check if README.md exists
    if (!fs.existsSync(readmePath)) {
      console.warn('⚠️ Bundled README.md not found, skipping update');
      return;
    }

    // Read the README file
    let readmeContent = fs.readFileSync(readmePath, 'utf8');

    // Calculate total tools
    const totalTools = mcps.reduce(
      (total, mcp) => total + (mcp.tools?.length || 0),
      0
    );

    // Update MCP stats section
    const statsPattern =
      /<!-- BEGIN MCP STATS -->[\s\S]*?<!-- END MCP STATS -->/;
    const statsContent = `<!-- BEGIN MCP STATS -->
Bundled MCPs provide a comprehensive suite of ${totalTools} tools across ${mcps.length} third-party MCP servers.
<!-- END MCP STATS -->`;

    if (readmeContent.match(statsPattern)) {
      readmeContent = readmeContent.replace(statsPattern, statsContent);
    }

    // Update MCP table section
    const tablePattern =
      /<!-- BEGIN MCP TABLE -->[\s\S]*?<!-- END MCP TABLE -->/;

    // Generate new MCP table content
    let tableContent = `<!-- BEGIN MCP TABLE -->\n`;
    tableContent += `| Name | Version | Tools | Risk Score |\n`;
    tableContent += `| ---- | ------- | ----- | ---------- |\n`;

    for (const mcp of mcps.sort((a, b) => a.name.localeCompare(b.name))) {
      const toolCount = mcp.tools?.length || 0;

      // Check if security scan exists
      let riskScore = 'N/A';
      const securityScanPath = path.join(
        mcpDocsDir,
        mcp.name,
        'security-scan.json'
      );
      if (fs.existsSync(securityScanPath)) {
        try {
          const securityScan = JSON.parse(
            fs.readFileSync(securityScanPath, 'utf8')
          );
          // Format risk score with color based on severity
          let riskColor = '';
          if (securityScan.riskScore >= 75) {
            riskColor = '🔴';
          } else if (securityScan.riskScore >= 40) {
            riskColor = '🟠';
          } else {
            riskColor = '🟢';
          }
          riskScore = `${riskColor} [${securityScan.riskScore}/100](./${mcp.name}/security-scan.json)`;
        } catch (error) {
          console.warn(
            `⚠️ Error reading security scan for ${mcp.name}:`,
            error
          );
        }
      }

      tableContent += `| [${mcp.name}](./${mcp.name}) | ${mcp.version} | ${toolCount} | ${riskScore} |\n`;
    }

    tableContent += '\n';

    // Add a tool count by MCP
    tableContent += `## Tool Count by MCP\n\n`;
    tableContent += `| MCP | Tool Count |\n`;
    tableContent += `| --- | ---------- |\n`;

    for (const mcp of mcps.sort(
      (a, b) => (b.tools?.length || 0) - (a.tools?.length || 0)
    )) {
      const toolCount = mcp.tools?.length || 0;
      tableContent += `| ${mcp.name} | ${toolCount} |\n`;
    }

    tableContent += '\n';
    tableContent += `<!-- END MCP TABLE -->`;

    if (readmeContent.match(tablePattern)) {
      readmeContent = readmeContent.replace(tablePattern, tableContent);
    }

    // Add security scan section if any scans exist
    const securityScans = mcps.filter((mcp) => {
      const securityScanPath = path.join(
        mcpDocsDir,
        mcp.name,
        'security-scan.json'
      );
      return fs.existsSync(securityScanPath);
    });

    if (securityScans.length > 0) {
      const securityPattern =
        /<!-- BEGIN SECURITY SCAN SUMMARY -->[\s\S]*?<!-- END SECURITY SCAN SUMMARY -->/;

      let securityContent = `<!-- BEGIN SECURITY SCAN SUMMARY -->\n`;
      securityContent += `## Security Scan Results\n\n`;
      securityContent += `Security scans are performed on each bundled MCP using AWS Bedrock Claude to analyze for potential security issues.\n\n`;

      // Add security risk distribution section
      securityContent += `### Security Risk Distribution\n\n`;

      // Count MCPs by risk level
      const riskDistribution = {
        low: 0, // 0-39
        medium: 0, // 40-74
        high: 0 // 75-100
      };

      // Count total findings by category
      const findingsByCategory: Record<string, number> = {};

      // Process security scans to calculate distributions
      for (const mcp of securityScans) {
        const securityScanPath = path.join(
          mcpDocsDir,
          mcp.name,
          'security-scan.json'
        );
        try {
          const scan = JSON.parse(fs.readFileSync(securityScanPath, 'utf8'));

          // Update risk distribution
          if (scan.riskScore >= 75) {
            riskDistribution.high++;
          } else if (scan.riskScore >= 40) {
            riskDistribution.medium++;
          } else {
            riskDistribution.low++;
          }

          // Count findings by category
          if (scan.findings) {
            for (const finding of scan.findings) {
              const category = finding.category;
              findingsByCategory[category] =
                (findingsByCategory[category] || 0) + 1;
            }
          }
        } catch (error) {
          console.warn(
            `⚠️ Error processing security distribution for ${mcp.name}:`,
            error
          );
        }
      }

      // Generate risk distribution table
      securityContent += `#### Risk Score Distribution\n\n`;
      securityContent += `| Risk Level | Count | Description |\n`;
      securityContent += `| ---------- | ----- | ----------- |\n`;
      securityContent += `| 🔴 High (75-100) | ${riskDistribution.high} | Critical security issues present |\n`;
      securityContent += `| 🟠 Medium (40-74) | ${riskDistribution.medium} | Moderate security concerns |\n`;
      securityContent += `| 🟢 Low (0-39) | ${riskDistribution.low} | Minor or no security issues |\n\n`;

      // Generate top vulnerability categories
      if (Object.keys(findingsByCategory).length > 0) {
        const sortedCategories = Object.entries(findingsByCategory)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5); // Show top 5 categories

        securityContent += `#### Most Common Vulnerability Types\n\n`;
        securityContent += `| Category | Count |\n`;
        securityContent += `| -------- | ----- |\n`;

        for (const [category, count] of sortedCategories) {
          // Format category name for display
          const displayCategory = category
            .split('_')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

          securityContent += `| ${displayCategory} | ${count} |\n`;
        }
        securityContent += `\n`;
      }

      // Security scan results table
      securityContent += `### MCPs by Security Risk Score\n\n`;
      securityContent += `| MCP | Risk Score | Highest Risk Category | Level | Score |\n`;
      securityContent += `| --- | ---------- | --------------------- | ----- | ----- |\n`;

      for (const mcp of securityScans.sort((a, b) => {
        // Sort by risk score descending
        const scanPathA = path.join(mcpDocsDir, a.name, 'security-scan.json');
        const scanPathB = path.join(mcpDocsDir, b.name, 'security-scan.json');
        try {
          const scanA = JSON.parse(fs.readFileSync(scanPathA, 'utf8'));
          const scanB = JSON.parse(fs.readFileSync(scanPathB, 'utf8'));
          return scanB.riskScore - scanA.riskScore;
        } catch {
          return 0;
        }
      })) {
        const securityScanPath = path.join(
          mcpDocsDir,
          mcp.name,
          'security-scan.json'
        );
        try {
          const scan = JSON.parse(fs.readFileSync(securityScanPath, 'utf8'));

          // Find highest risk category
          let highestCategory = { name: 'none', level: 'none', score: 0 };
          for (const [category, data] of Object.entries(
            scan.securityCategories
          )) {
            if ((data as any).score > highestCategory.score) {
              highestCategory = {
                name: category,
                level: (data as any).riskLevel,
                score: (data as any).score
              };
            }
          }

          // Format category name for display
          const displayCategory = highestCategory.name
            .split('_')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

          // Add risk indicator based on score
          let riskIndicator = '🟢';
          if (scan.riskScore >= 75) {
            riskIndicator = '🔴';
          } else if (scan.riskScore >= 40) {
            riskIndicator = '🟠';
          }

          securityContent += `| ${riskIndicator} [${mcp.name}](./${mcp.name}) | [${scan.riskScore}/100](./${mcp.name}/security-scan.json) | ${displayCategory} | ${highestCategory.level.toUpperCase()} | ${highestCategory.score}/100 |\n`;
        } catch (error) {
          console.warn(
            `⚠️ Error processing security scan for ${mcp.name}:`,
            error
          );
          securityContent += `| [${mcp.name}](./${mcp.name}) | Error | Error | Error | Error |\n`;
        }
      }

      securityContent += `<!-- END SECURITY SCAN SUMMARY -->`;

      if (readmeContent.match(securityPattern)) {
        readmeContent = readmeContent.replace(securityPattern, securityContent);
      }
    }

    // Write updated README
    fs.writeFileSync(readmePath, readmeContent);
    console.log(`✅ Updated bundled README.md`);
  } catch (error) {
    console.error('❌ Error updating bundled README.md:', error);
  }
}

// Main function
async function main() {
  try {
    // Generate MCP documentation and update READMEs
    await generateBundledMCPDocs();
  } catch (error) {
    console.error('❌ Error in main execution:', error);
    process.exit(1);
  }
}

// Run the generator
main();
