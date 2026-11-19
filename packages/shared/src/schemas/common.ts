import { z } from 'zod';
import { FULFILLMENT_METHODS } from '../enums';

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Netinkamas ID');

export const centsSchema = z.number().int().nonnegative();

export const customerInputSchema = z.object({
  name: z
    .string({ error: 'Įveskite vardą' })
    .trim()
    .min(2, 'Įveskite vardą (bent 2 raidės)')
    .max(100, 'Per ilgas vardas'),
  // Pirmiau trim, tada validacija: " ona@example.com " turi praeiti ir būti išsaugotas be tarpų.
  email: z
    .string({ error: 'Įveskite el. paštą' })
    .trim()
    .min(1, 'Įveskite el. paštą')
    .pipe(z.email('Netinkamas el. pašto adresas').max(200, 'Per ilgas el. pašto adresas')),
  phone: z
    .string({ error: 'Įveskite telefono numerį' })
    .trim()
    .min(1, 'Įveskite telefono numerį')
    .min(8, 'Per trumpas telefono numeris')
    .max(20, 'Per ilgas telefono numeris')
    .regex(/^[+\d\s\-()]+$/, 'Netinkamas telefono numeris'),
});
export type CustomerInput = z.infer<typeof customerInputSchema>;

export const fulfillmentInputSchema = z
  .object({
    method: z.enum(FULFILLMENT_METHODS),
    address: z.string().trim().max(300).optional(),
    notes: z.string().trim().max(1000, 'Per ilgos pastabos (iki 1000 simbolių)').optional(),
  })
  .refine((f) => f.method !== 'delivery' || (f.address && f.address.length > 0), {
    message: 'Pristatymui reikia adreso',
    path: ['address'],
  });
export type FulfillmentInput = z.infer<typeof fulfillmentInputSchema>;
