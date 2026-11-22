import { isIP } from 'node:net';
import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OrderErrorCode } from '@desert-web/shared';
import type { Env } from '../config/env';
import { SITEVERIFY_CLIENT, type SiteverifyClient } from './siteverify';

/** Tokeno klaidos: pirkėjas turi gauti naują tokeną (perkrauti valdiklį). */
const TOKEN_ERRORS = new Set([
  'missing-input-response',
  'invalid-input-response',
  'timeout-or-duplicate',
]);

const error = (code: OrderErrorCode, message: string) => ({ code, message });

export const TURNSTILE_FAILED_MESSAGE =
  'Nepavyko patvirtinti, kad esate ne robotas. Bandykite dar kartą.';
export const TURNSTILE_UNAVAILABLE_MESSAGE =
  'Šiuo metu nepavyksta patikrinti užklausos. Bandykite dar kartą po minutės.';

export interface TurnstileVerifyOptions {
  /** Pirkėjo IP (req.clientIp). */
  remoteIp?: string;
  /** clientRequestId: to paties užsakymo pakartojimas nelaikomas tokeno pakartotiniu naudojimu. */
  idempotencyKey?: string;
}

/**
 * Cloudflare Turnstile tokeno tikrinimas (siteverify). Fail closed: jei Cloudflare
 * nepasiekiamas, užsakymas nepriimamas (503 TURNSTILE_UNAVAILABLE), o klaida užrašoma į logą.
 */
@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);
  private readonly secret: string;

  constructor(
    config: ConfigService<Env, true>,
    @Inject(SITEVERIFY_CLIENT) private readonly siteverify: SiteverifyClient,
  ) {
    // Produkcijoje raktas privalomas (env.ts), todėl testinis čia būna tik vystant ir testuose.
    this.secret = config.get('TURNSTILE_SECRET_KEY', { infer: true });
  }

  /** Meta 403 TURNSTILE_FAILED arba 503 TURNSTILE_UNAVAILABLE; kitaip tokenas galioja. */
  async verify(token: string | undefined, options: TurnstileVerifyOptions = {}): Promise<void> {
    if (!token) {
      throw new ForbiddenException(error('TURNSTILE_FAILED', TURNSTILE_FAILED_MESSAGE));
    }

    let result;
    try {
      result = await this.siteverify({
        secret: this.secret,
        response: token,
        remoteip: options.remoteIp && isIP(options.remoteIp) ? options.remoteIp : undefined,
        idempotencyKey: options.idempotencyKey,
      });
    } catch (cause) {
      this.logger.error(`Cloudflare siteverify unreachable: ${describe(cause)}`);
      throw new ServiceUnavailableException(
        error('TURNSTILE_UNAVAILABLE', TURNSTILE_UNAVAILABLE_MESSAGE),
      );
    }

    if (result.success) return;
    const codes = result['error-codes'] ?? [];
    if (codes.length > 0 && codes.every((c) => TOKEN_ERRORS.has(c))) {
      throw new ForbiddenException(error('TURNSTILE_FAILED', TURNSTILE_FAILED_MESSAGE));
    }
    // Neteisingas secret, bad-request, internal-error: ne pirkėjo kaltė ir nauju tokenu
    // nepasitaisys. Fail closed kaip ir nepasiekiamo Cloudflare atveju.
    this.logger.error(`Cloudflare siteverify error: ${codes.join(', ') || 'no code'}`);
    throw new ServiceUnavailableException(
      error('TURNSTILE_UNAVAILABLE', TURNSTILE_UNAVAILABLE_MESSAGE),
    );
  }
}

function describe(cause: unknown): string {
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`;
  return String(cause);
}
