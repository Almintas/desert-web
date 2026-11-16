import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z, ZodType } from 'zod';

/**
 * Validuoja request body / query su Zod schema iš @desert-web/shared.
 * Naudojimas: @Body(new ZodValidationPipe(createOrderInputSchema)) body: CreateOrderInput
 */
export class ZodValidationPipe<T extends ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Netinkami duomenys',
        issues: result.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
