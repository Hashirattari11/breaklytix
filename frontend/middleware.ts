import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Server-side gate for the admin area.
 *
 * `bx_session` is an httpOnly cookie set by POST /api/session only after the
 * backend has validated the Bearer token (GET /auth/me). The admin server
 * layout then re-verifies the cookie against the backend on every request and
 * checks `is_admin`, so this middleware is only the cheap first pass: anonymous
 * visitors never get as far as rendering an admin shell.
 *
 * Public marketing routes are intentionally not matched.
 */
export function middleware(request: NextRequest) {
  if (!request.cookies.get("bx_session")?.value) {
    const next = request.nextUrl.pathname + request.nextUrl.search;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Match only the admin area. Do not gate /dashboard here: it keeps its
  // existing client-side auth flow, and a hard redirect would sign out users
  // whose token predates the cookie.
  matcher: ["/admin/:path*"],
};
