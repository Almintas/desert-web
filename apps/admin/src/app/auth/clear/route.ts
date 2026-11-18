import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session-cookie';

/**
 * Ištrina nebegaliojančios sesijos cookie ir nukreipia į /login.
 * requireAdmin() čia nukreipia, kai API atsako 401 (Server Component cookie keisti negali).
 */
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
