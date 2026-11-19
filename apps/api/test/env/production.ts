/**
 * Importuojamas PIRMAS spec faile: API kaip produkcijoje (NODE_ENV=production). Jest kiekvienam
 * spec failui duoda savo process.env kopiją, todėl kiti failai to nemato.
 */
process.env.NODE_ENV = 'production';
process.env.CLOUDINARY_CLOUD_NAME = 'desert-cloud';
process.env.CLOUDINARY_API_KEY = '123456789012345';
process.env.CLOUDINARY_API_SECRET = 'cloudinary-paslaptis-testams';
process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA';
// Mažesnė riba, kad būtų galima patikrinti, jog ribojamos ir užklausos be paslapties.
process.env.ORDER_RATE_LIMIT_SHORT = '20';
