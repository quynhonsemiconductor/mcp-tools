export interface IClientGenerator {
  create(
    inputSpecFilePath: string,
    generator: string,
    outputDirectory: string,
  ): Promise<string | null | undefined>;
}
