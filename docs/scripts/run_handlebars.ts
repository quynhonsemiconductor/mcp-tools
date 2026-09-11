#!/usr/bin/env bun

import Handlebars from 'handlebars';

async function main() {
  const templatePath = process.argv[2];

  if (!templatePath) {
    console.error('Usage: run_handlebars.ts <template-file>');
    console.error('Template data is read from stdin as JSON');
    process.exit(1);
  }

  // Read template file
  let templateContent: string;
  try {
    templateContent = await Bun.file(templatePath).text();
  } catch (err) {
    console.error(`Error reading template file: ${templatePath}`);
    process.exit(1);
  }
  // Read JSON data from stdin
  let inputData: string = '';
  for await (const chunk of Bun.stdin.stream()) {
    inputData += new TextDecoder().decode(chunk);
  }
  let data: any[];
  try {
    data = JSON.parse(inputData);
  } catch (err) {
    console.error('Error parsing JSON from stdin');
    process.exit(1);
  }

  // Compile and render template
  const template = Handlebars.compile(templateContent);
  const output = data.map((tool: any) => {
    return {
      ...tool,
      docContent: template(tool)
    };
  });

  // Write to stdout
  await Bun.stdout.write(JSON.stringify(output));
}

main();
