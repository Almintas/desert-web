import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AdminRequest } from './admin-request';
import { AdminAuthService } from './admin-auth.service';

/** Reikalauja `Authorization: Bearer <token>` su galiojančia admino sesija. */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly auth: AdminAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const match = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(request.headers.authorization ?? '');
    const session = match ? await this.auth.authenticate(match[1]!) : null;
    if (!session) {
      throw new UnauthorizedException('Reikia prisijungti');
    }
    request.admin = session.admin;
    request.adminSessionId = session.sessionId;
    return true;
  }
}
