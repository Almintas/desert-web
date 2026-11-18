import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AdminDto } from '@desert-web/shared';
import type { AdminRequest } from './admin-request';

/** Prisijungęs adminas. Naudoti tik kartu su AdminAuthGuard. */
export const CurrentAdmin = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AdminRequest>().admin as AdminDto;
});
