"""Middleware rate-limit rules.

Instant scans are intentionally unlimited per visitor: the scan engine bounds
concurrency, and the middleware must not 429 scan requests.
"""
from __future__ import annotations

from app.ratelimit import RateLimitMiddleware


def test_instant_scan_has_no_middleware_cap():
    middleware = RateLimitMiddleware(app=None)
    now = 1_000.0

    for i in range(500):
        allowed, retry = middleware._check(
            "203.0.113.7", "/api/instant-scan", "POST", now + i
        )
        assert allowed is True
        assert retry == 0


def test_auth_route_still_rate_limited():
    middleware = RateLimitMiddleware(app=None)
    now = 1_000.0

    allowed = [
        middleware._check("203.0.113.7", "/auth/github/callback", "GET", now)[0]
        for _ in range(21)
    ]

    assert allowed[:20] == [True] * 20
    assert allowed[20] is False
