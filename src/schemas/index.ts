import { z } from 'zod';

export const VinSchema = z
  .string()
  .length(17, 'VIN must be exactly 17 characters')
  .regex(/^[A-HJ-NPR-Z0-9]+$/, 'VIN can only contain alphanumeric characters excluding I, O, Q')
  .transform((vin) => vin.toUpperCase());
