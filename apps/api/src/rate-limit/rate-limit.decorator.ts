import { applyDecorators, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { RateLimitGuard } from './rate-limit.guard';
import { RATE_LIMIT_NAMES, type RateLimitName } from './rate-limits';

/**
 * Taiko nurodytus ribojimus maršrutui (visi kiti praleidžiami). Guard'as veikia prieš body
 * validaciją ir handlerį, todėl skaičiuojamas kiekvienas bandymas, ir nesėkmingas.
 */
export function RateLimit(...names: RateLimitName[]) {
  const skipped = RATE_LIMIT_NAMES.filter((n) => !names.includes(n));
  return applyDecorators(
    SkipThrottle(Object.fromEntries(skipped.map((n) => [n, true]))),
    UseGuards(RateLimitGuard),
  );
}
