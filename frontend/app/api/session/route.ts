import { NextRequest, NextResponse } from "next/server";

/**
 * Server-managed admin session cookie.
 *
 * The browser still authenticates API calls with the Bearer token in
 * localStorage (unchanged), but the Next.js server needs a way to verify who
 * is asking for an /admin page. POST /api/session validates the presented token
 * against the authoritative FastAPI backend (`GET /auth/me`) before setting an
 * httpOnly cookie; the cookie is only a server-side gate and grants no API
 * access on its own.
 *
 * DELETE clears it on sign-out. This route never returns the token.
 */

const API_BASE =
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8000";

const COOKIE_NAME = "bx_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, matches the JWT TTL default

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export async function POST(request: NextRequest) {
  // Same-origin only: blocks a cross-site form from planting a session cookie.
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin) {
    try {
      if (new URL(origin).host !== host) {
        return NextResponse.json({ ok: false, error: "bad_origin" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ ok: false, error: "bad_origin" }, { status: 403 });
    }
  }

  let token = "";
  try {
    const body = (await request.json()) as { token?: unknown };
    if (typeof body?.token === "string") token = body.token;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  // Session JWTs are compact strings; reject empty or oversized input early.
  if (!token || token.length > 4096) {
    return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });
  }

  let isAdmin = false;
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "invalid_session" }, { status: 401 });
    }
    const user = (await res.json()) as { is_admin?: boolean };
    isAdmin = Boolean(user?.is_admin);
  } catch {
    // Fail closed and do not set a cookie if the backend cannot be reached.
    return NextResponse.json({ ok: false, error: "auth_unavailable" }, { status: 503 });
  }

  const response = NextResponse.json({ ok: true, is_admin: isAdmin });
  response.cookies.set(COOKIE_NAME, token, {
    ...COOKIE_OPTIONS,
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", { ...COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
