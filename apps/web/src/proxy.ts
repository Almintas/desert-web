import { NextResponse } from 'next/server';

/**
 * Pirkėjo užsakymo puslapis (/uzsakymas/<accessToken>): nuoroda yra slaptas raktas, todėl
 * ji neturi patekti į Referer, paieškos sistemas ar jokius tarpinius podėlius.
 */
export function proxy() {
  const response = NextResponse.next();
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export const config = {
  matcher: ['/uzsakymas/:accessToken'],
};
