"""Lightweight in-memory rate limiting for abuse-prone endpoints.

Serverless caveat: counters are per-instance (each Vercel instance holds its
own), so limits are best-effort. They still blunt scripted bursts against a
warm instance and cost nothing; platform-level DDoS/abuse protection remains
Vercel's job. Never used for authorization — only for abuse damping.

Design notes:
- Pure ASGI middleware (no BaseHTTPMiddleware overhead).
- Sliding window via per-(ip, rule) monotonic deque; bounded memory with
  periodic eviction of stale keys.
- Rejected requests never touch the app; they get 429 + Retry-After.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

# (path prefix, max requests, window seconds). Keep the list small and
# focused on UNAUTHENTICATED endpoints an attacker can hammer:
#  - /auth/*  : OAuth code exchange (each hit costs a GitHub API round-trip)
_RATE_RULES: list[tuple[str, int, int]] = [
    ("/auth/", 20, 60),
]

_MAX_TRACKED_KEYS = 20_000


class RateLimitMiddleware:
    """Sliding-window per-client rate limit for sensitive path prefixes."""

    def __init__(self, app, rules: list[tuple[str, int, int]] | None = None):
        self.app = app
        self._rules = rules if rules is not None else _RATE_RULES
        self._lock = threading.Lock()
        self._hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)

    def _check(self, ip: str, path: str, now: float) -> tuple[bool, int]:
        """Return (allowed, retry_after_seconds). Caller applies the rule."""
        for prefix, limit, window in self._rules:
            if path.startswith(prefix):
                key = (ip, prefix)
                with self._lock:
                    dq = self._hits[key]
                    while dq and dq[0] <= now - window:
                        dq.popleft()
                    if len(dq) >= limit:
                        oldest = dq[0]
                        retry = max(1, int(window - (now - oldest)))
                        return False, retry
                    dq.append(now)
                    # Periodic eviction so idle keys cannot grow unbounded.
                    if len(self._hits) > _MAX_TRACKED_KEYS:
                        stale = [
                            k for k, v in self._hits.items()
                            if not v or v[-1] <= now - window
                        ]
                        for k in stale:
                            del self._hits[k]
                return True, 0
        return True, 0

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        allowed, retry = self._check(
            (scope.get("client") or ("unknown", 0))[0], path, time.monotonic()
        )
        if not allowed:
            body = b'{"detail": "Too many requests. Please slow down and retry shortly."}'
            headers = [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
                (b"retry-after", str(retry).encode()),
                (b"cache-control", b"no-store"),
            ]
            await send({"type": "http.response.start", "status": 429, "headers": headers})
            await send({"type": "http.response.body", "body": body})
            return

        await self.app(scope, receive, send)
