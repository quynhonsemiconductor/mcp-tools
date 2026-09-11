import { IClientGenerator } from '../model/types/i-client-generator.ts';
import fs from 'fs';
import { execa } from 'execa';
export class OpenApiClientGenerator implements IClientGenerator {
  async create(
    inputSpecFilePath: string,
    generator: string,
    outputDirectory: string,
  ): Promise<string | null | undefined> {
    if (!(await this.isOpenApiGeneratorAvailable())) {
      throw new Error('Openapi Generator is not installed!');
    }
    return await this.spawnAndCreateClient(inputSpecFilePath, generator, outputDirectory);
  }

  private async spawnAndCreateClient(
    inputSpecFilePath: string,
    generator: string,
    outputDirectory: string,
  ): Promise<string> {
    const fullDirectoryPath = `${outputDirectory}/clients/${generator}`;
    if (!fs.existsSync(fullDirectoryPath)) {
      fs.mkdirSync(fullDirectoryPath, { recursive: true });
    }
    await execa`openapi-generator generate -i ${inputSpecFilePath} -g ${generator} -o ${fullDirectoryPath}`;
    return 'Client generated successfully!';
  }

  private async isOpenApiGeneratorAvailable(): Promise<boolean> {
    try {
      await execa`openapi-generator --version`;
      return true;
    } catch {
      return false;
    }
  }
}
