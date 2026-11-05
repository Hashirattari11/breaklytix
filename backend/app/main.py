"""Breaklytix — FastAPI entrypoint.

Run locally:
    uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import fnmatch

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import settings
from .deps import require_internal_secret
from .ratelimit import RateLimitMiddleware
from .routers import auth, billing, cli, fixes, internal, repos, slack, public_api, agency, admin, health, notifications, impact, consent, digital_twin
from .routers.admin import router as admin_router
from .changelog.router import router as changelog_router


def _origin_allowed(origin: str) -> bool:
    """Match an Origin header against settings.cors_origins, supporting the
    `https://frontend-*.vercel.app` wildcard pattern used by preview deploys."""
    if not origin:
        return False
    for entry in settings.cors_origins:
        if entry == origin:
            return True
        if "*" in entry and fnmatch.fnmatch(origin, entry):
            return True
    return False


_SECURITY_HEADERS = {
    # CSP sized for the auto-docs (Swagger UI loads from cdn.jsdelivr.net).
    b"content-security-policy": (
        b"default-src 'self'; "
        b"script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        b"style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        b"img-src 'self' data: https://fastapi.tiangolo.com; "
        b"font-src 'self' data: https://cdn.jsdelivr.net; "
        b"connect-src 'self'; "
        b"frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
    ),
    b"strict-transport-security": b"max-age=63072000; includeSubDomains; preload",
    b"x-frame-options": b"DENY",
    b"x-content-type-options": b"nosniff",
    b"referrer-policy": b"strict-origin-when-cross-origin",
    b"permissions-policy": b"camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)",
    b"x-xss-protection": b"1; mode=block",
}


class SecurityHeadersMiddleware:
    """Add security headers to every response, including error responses."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                existing = {h[0].lower() for h in headers}
                for key, value in _SECURITY_HEADERS.items():
                    if key not in existing:
                        headers.append((key, value))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_wrapper)


app = FastAPI(
    title="Breaklytix",
    version="1.0.0",
    description="Phase 3 — detect third-party API usage, alert on changes, auto-fix via PRs, and manage subscriptions.",
)

# The frontend authenticates via a JWT stored in localStorage (no cookies),
# so we do NOT need allow_credentials. Origins come from settings
# (FRONTEND_ORIGINS) and support `frontend-*.vercel.app` preview wildcards.
_origins = settings.cors_origins
_exact_origins = [o for o in _origins if "*" not in o]
_wildcard_origins = [o for o in _origins if "*" in o]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_exact_origins,
    allow_origin_regex=(
        "|".join(fnmatch.translate(o) for o in _wildcard_origins) if _wildcard_origins else None
    ),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting sits INSIDE the security-headers middleware (which is added
# last and therefore runs first) so 429 responses still carry CSP/HSTS etc.
app.add_middleware(RateLimitMiddleware)

app.add_middleware(SecurityHeadersMiddleware)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Ensure CORS headers are present even on HTTP error responses (e.g. 502).

    Preserve exception headers too: the default handler forwards things like
    ``WWW-Authenticate`` and ``Retry-After``, and dropping them here broke the
    public API's Bearer challenge.
    """
    origin = request.headers.get("origin", "")
    headers = dict(exc.headers or {})
    headers["Access-Control-Allow-Methods"] = "*"
    headers["Access-Control-Allow-Headers"] = "*"
    if _origin_allowed(origin):
        headers["Access-Control-Allow-Origin"] = origin
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=headers)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch ANY unhandled error so the client gets a safe, generic message.
    Full details are logged server-side only — never echoed to the client
    (prevents accidental secret/stack exposure)."""
    import traceback
    origin = request.headers.get("origin", "")
    headers = {"Access-Control-Allow-Methods": "*", "Access-Control-Allow-Headers": "*"}
    if _origin_allowed(origin):
        headers["Access-Control-Allow-Origin"] = origin
    print("UNHANDLED ERROR:", traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers=headers,
    )


app.include_router(auth.router)
app.include_router(consent.router)
app.include_router(billing.router)
app.include_router(cli.router)
app.include_router(fixes.router)
app.include_router(repos.router)
app.include_router(internal.router)
app.include_router(slack.router)
app.include_router(public_api.router)
app.include_router(agency.router)
app.include_router(changelog_router)
app.include_router(admin_router)
app.include_router(health.router)
app.include_router(notifications.router)
app.include_router(impact.router)
app.include_router(digital_twin.router)


@app.get("/", tags=["meta"])
def root() -> dict:
    return {"service": "Breaklytix", "status": "ok", "docs": "/docs"}


@app.get("/healthz", tags=["meta"])
def healthz() -> dict:
    return {"status": "healthy"}


@app.get("/debug/oauth", tags=["meta"])
def debug_oauth(_: None = Depends(require_internal_secret)) -> dict:
    """Check OAuth env vars are loaded (show partial values only)."""
    cid = settings.github_client_id or ""
    csec = settings.github_client_secret or ""
    return {
        "client_id_loaded": bool(cid),
        "client_id_prefix": cid[:8] + "..." if len(cid) > 8 else cid,
        "client_secret_loaded": bool(csec),
        "client_secret_prefix": csec[:6] + "..." if len(csec) > 6 else csec,
        "frontend_origins": settings.frontend_origins,
    }


@app.get("/debug/crypto", tags=["meta"])
def debug_crypto(_: None = Depends(require_internal_secret)) -> dict:
    """Verify the Fernet TOKEN_ENCRYPTION_KEY is valid on this deployment."""
    from .crypto import get_cipher
    try:
        cipher = get_cipher()
        sample = cipher.encrypt("test-token")
        decrypted = cipher.decrypt(sample)
        return {
            "key_loaded": bool(settings.token_encryption_key),
            "key_length": len(settings.token_encryption_key),
            "valid": decrypted == "test-token",
            "message": "OK" if decrypted == "test-token" else "MISMATCH",
        }
    except Exception as exc:
        return {
            "key_loaded": bool(settings.token_encryption_key),
            "key_length": len(settings.token_encryption_key),
            "valid": False,
            "message": f"{exc.__class__.__name__}: {exc}",
        }


@app.get("/debug/email", tags=["meta"])
def debug_email(
    to: str | None = None,
    _: None = Depends(require_internal_secret),
) -> dict:
    """Verify the active email provider API key is loaded and sending works.

    The active provider comes from EMAIL_PROVIDER (default: "brevo"); the
    response reports the key state + a real test send for that provider.

    Optional `to` overrides the recipient (must be a plain email address) so a
    real delivery can be verified against a mailbox you control. Still guarded
    by X-Internal-Secret, so this cannot be used as an open relay.
    """
    import re
    from .email_client import get_provider, send_email

    provider = get_provider()
    if provider == "brevo":
        api_key = settings.brevo_api_key
        from_addr = settings.brevo_from_email
    else:
        api_key = settings.resend_api_key
        from_addr = settings.resend_from_email

    sender_match = re.search(r"<([^>]+)>", from_addr or "")
    sender_addr = sender_match.group(1) if sender_match else "test@example.com"
    if to:
        if not re.fullmatch(r"[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+", to):
            raise StarletteHTTPException(status_code=400, detail="Invalid `to` address")
        recipient = to
    else:
        recipient = sender_addr
    return {
        "provider": provider,
        "api_key_loaded": bool(api_key),
        "api_key_prefix": (api_key or "")[:8] + "..." if api_key else "NONE",
        "from_email": from_addr,
        "recipient": recipient,
        "frontend_base_url": settings.frontend_base_url,
        "test_send": send_email(
            recipient,
            "Breaklytix Debug Email",
            "<p>Debug email from deployed Breaklytix backend.</p>",
            "Debug email from deployed Breaklytix backend.",
        ),
    }
