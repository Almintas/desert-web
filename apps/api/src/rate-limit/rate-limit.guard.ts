import { type ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { ClientIpRequest } from '../common/client-ip';
import type { Env } from '../config/env';
import { type RateLimit, type RateLimitName, rateLimitsFromConfig } from './rate-limits';

/** Kuris ribojimas suveikė (nustatoma prieš throwThrottlingException tame pačiame request). */
interface ThrottledRequest extends Request {
  rateLimitName?: string;
}

/** Ribojimo raktas: kliento IP su šaltiniu (perduotas web/admin serverio ar tiesioginis). */
export function rateLimitTracker(req: Request): string {
  const r = req as ClientIpRequest;
  const ip = r.clientIp ?? req.ip ?? 'unknown';
  return r.clientIpSource === 'forwarded' ? `client:${ip}` : `ip:${ip}`;
}

/**
 * ThrottlerGuard su vienoda 429 forma: `{ statusCode, code: 'TOO_MANY_REQUESTS', message }` ir
 * standartine `Retry-After` antrašte (sekundėmis). Biblioteka pavadintiems ribojimams rašytų
 * `Retry-After-<vardas>`, todėl jos antraštės išjungtos (setHeaders: false).
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  private readonly limits: Record<RateLimitName, RateLimit>;

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    config: ConfigService<Env, true>,
  ) {
    super(options, storage, reflector);
    this.limits = rateLimitsFromConfig(config);
  }

  protected override async handleRequest(props: ThrottlerRequest): Promise<boolean> {
    const req = props.context.switchToHttp().getRequest<ThrottledRequest>();
    req.rateLimitName = props.throttler.name;
    return super.handleRequest(props);
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const http = context.switchToHttp();
    const req = http.getRequest<ThrottledRequest>();
    const res = http.getResponse<Response>();
    const name = req.rateLimitName as RateLimitName | undefined;
    const retryAfter = Math.max(1, Math.ceil(detail.timeToBlockExpire));
    res.setHeader('Retry-After', String(retryAfter));
    const message =
      (name && this.limits[name]?.message) || 'Per daug bandymų. Pabandykite po kelių minučių.';
    throw new HttpException(
      { statusCode: HttpStatus.TOO_MANY_REQUESTS, code: 'TOO_MANY_REQUESTS', message },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
