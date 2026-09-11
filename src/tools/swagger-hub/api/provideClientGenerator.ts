import { OpenApiClientGenerator } from './data/openapi-client-generator.ts';

export const ProvideClientGenerator = () => {
  return new OpenApiClientGenerator();
};
