"""Dual internal-secret acceptance tests (CRON_SECRET or INTERNAL_SECRET).

Guards the fix for the GitHub Actions cron mismatch: workflows send the
repository's INTERNAL_SECRET, platform crons send CRON_SECRET — the two values
may differ, and EITHER match must authenticate the /internal/* endpoints.
"""
import pytest
from fastapi import HTTPException

from app import deps
from app.config import settings


@pytest.fixture
def clean_secrets(monkeypatch):
    monkeypatch.delenv("CRON_SECRET", raising=False)
    monkeypatch.setattr(settings, "internal_secret", "")


def test_internal_secrets_lists_both_values(clean_secrets, monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "cron-value")
    monkeypatch.setattr(settings, "internal_secret", "actions-value")
    assert settings.internal_secrets == ["cron-value", "actions-value"]


def test_internal_secrets_dedups_identical_values(clean_secrets, monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "same")
    monkeypatch.setattr(settings, "internal_secret", "same")
    assert settings.internal_secrets == ["same"]


def test_internal_secrets_empty(clean_secrets):
    assert settings.internal_secrets == []


def test_guard_accepts_either_secret(clean_secrets, monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "cron-value")
    monkeypatch.setattr(settings, "internal_secret", "actions-value")
    deps.require_internal_secret("actions-value")
    deps.require_internal_secret("cron-value")


def test_guard_rejects_wrong_value(clean_secrets, monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "cron-value")
    monkeypatch.setattr(settings, "internal_secret", "actions-value")
    with pytest.raises(HTTPException) as ei:
        deps.require_internal_secret("totally-different")
    assert ei.value.status_code == 401
    assert "Internal" in ei.value.detail or "internal" in ei.value.detail


def test_guard_rejects_missing_header(clean_secrets, monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "cron-value")
    with pytest.raises(HTTPException) as ei:
        deps.require_internal_secret(None)
    assert ei.value.status_code == 401


def test_guard_fails_closed_without_any_secret(clean_secrets):
    with pytest.raises(HTTPException) as ei:
        deps.require_internal_secret("anything")
    assert ei.value.status_code == 503
