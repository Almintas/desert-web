/**
 * DB saugo laikus UTC. Pirkėjams ir adminui rodome parduotuvės laiku.
 */
export const SHOP_TIMEZONE = 'Europe/Vilnius';

const dateTimeFormatter = new Intl.DateTimeFormat('lt-LT', {
  timeZone: SHOP_TIMEZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
});

const dateFormatter = new Intl.DateTimeFormat('lt-LT', {
  timeZone: SHOP_TIMEZONE,
  dateStyle: 'medium',
});

export function formatShopDateTime(value: Date | string): string {
  return dateTimeFormatter.format(new Date(value));
}

export function formatShopDate(value: Date | string): string {
  return dateFormatter.format(new Date(value));
}
