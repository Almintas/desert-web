import { z } from 'zod';
import { FULFILLMENT_METHODS } from '../enums';

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Netinkamas ID');

export const centsSchema = z.number().int().nonnegative();

export const customerInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  // Pirmiau trim, tada validacija: " ona@example.com " turi praeiti ir būti išsaugotas be tarpų.
  email: z.string().trim().pipe(z.email().max(200)),
  phone: z
    .string()
    .trim()
    .min(8)
    .max(20)
    .regex(/^[+\d\s\-()]+$/, 'Netinkamas telefono numeris'),
});
export type CustomerInput = z.infer<typeof customerInputSchema>;

export const fulfillmentInputSchema = z
  .object({
    method: z.enum(FULFILLMENT_METHODS),
    address: z.string().trim().max(300).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((f) => f.method !== 'delivery' || (f.address && f.address.length > 0), {
    message: 'Pristatymui reikia adreso',
    path: ['address'],
  });
export type FulfillmentInput = z.infer<typeof fulfillmentInputSchema>;
