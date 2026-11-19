/** Importuojamas PIRMAS: mažos ribos ribojimų testams (žr. global-setup.ts didelėms). */
process.env.ORDER_RATE_LIMIT_SHORT = '3';
process.env.ORDER_RATE_WINDOW_SHORT_SECONDS = '2';
process.env.ORDER_RATE_LIMIT_DAILY = '5';
process.env.ORDER_RATE_WINDOW_DAILY_SECONDS = '86400';
process.env.ORDER_ACCESS_RATE_LIMIT = '4';
process.env.ORDER_ACCESS_RATE_WINDOW_SECONDS = '60';
