import type { SpecialOrderErrorCode } from '@desert-web/shared';

/** Klaida su `code` (SPECIAL_ORDER_ERROR_CODES) ir papildomais laukais. */
export function specialOrderError(
  Exception: new (body: object) => Error,
  code: SpecialOrderErrorCode,
  message: string,
  extra: Record<string, unknown> = {},
): Error {
  return new Exception({ code, message, ...extra });
}
