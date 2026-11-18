import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session-cookie';

/**
 * Optimistinis nukreipimas: be sesijos cookie iškart į /login.
 * Tai NE autorizacija: cookie galiojimą tikrina requireAdmin() (lib/dal.ts) per API.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Viskas, išskyrus prisijungimą, cookie valymą ir statinius failus.
    '/((?!login|auth/clear|_next/static|_next/image|favicon.ico|robots.txt).*)',
  ],
};
