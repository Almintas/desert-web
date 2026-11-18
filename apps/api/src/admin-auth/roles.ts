import type { AdminRole } from '@desert-web/shared';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminRequest } from './admin-request';

const ROLES_KEY = 'adminRoles';

/** Leidžia endpointą tik nurodytoms rolėms. Naudoti su @UseGuards(AdminAuthGuard, RolesGuard). */
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const admin = context.switchToHttp().getRequest<AdminRequest>().admin;
    if (!admin) throw new UnauthorizedException('Reikia prisijungti');
    if (!roles.includes(admin.role)) {
      throw new ForbiddenException('Šiam veiksmui neturi teisių');
    }
    return true;
  }
}
