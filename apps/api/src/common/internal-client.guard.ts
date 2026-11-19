import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../config/env';
import { hasInternalSecret } from './client-ip';

/**
 * Produkcijoje maršrutas priimamas tik iš mūsų Next.js serverių (teisinga X-Internal-Secret):
 * API Railway pasiekiamas viešai, todėl be šito robotai galėtų kurti užsakymus apeidami web
 * (ir Turnstile valdiklį). Vystant ir testuose nieko netikrina, kaip iki šiol.
 */
@Injectable()
export class InternalClientGuard implements CanActivate {
  private readonly production: boolean;
  private readonly secret: string | undefined;

  constructor(config: ConfigService<Env, true>) {
    this.production = config.get('NODE_ENV', { infer: true }) === 'production';
    this.secret = config.get('INTERNAL_API_SECRET', { infer: true });
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.production) return true;
    const req = context.switchToHttp().getRequest<Request>();
    if (hasInternalSecret(req, this.secret)) return true;
    throw new ForbiddenException({
      code: 'FORBIDDEN_CLIENT',
      message: 'Užsakymai priimami tik per parduotuvės svetainę.',
    });
  }
}
