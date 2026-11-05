"""Impact Engine API endpoints.

Provides endpoints for:
- Impact analysis of provider changes
- Fire Drill analysis
- Fix generation and verification
- Impact history and details
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from ..deps import get_current_user_id
from ..db import db
from ..impact.analyzer import (
    ImpactAnalysis,
    analyze_changelog_event,
    analyze_repo_for_provider,
    persist_impact_analysis,
    get_impact_analysis,
    get_repo_impact_analyses,
)
from ..impact.fix_generator import generate_fixes_for_analysis

router = APIRouter(prefix="/impact", tags=["impact"])


# --- Request/Response models ---

class AnalyzeEventRequest(BaseModel):
    changelog_event_id: str
    repo_id: str


class FireDrillRequest(BaseModel):
    repo_id: str
    provider: str


class FireDrillMatrixRequest(BaseModel):
    repo_id: str


class GenerateFixRequest(BaseModel):
    analysis_id: str
    file_path: str | None = None  # Optional: specific file to fix


class ImpactAnalysisResponse(BaseModel):
    id: str
    repo_id: str
    changelog_event_id: str | None
    provider: str
    api_endpoint: str | None
    change_type: str
    change_description: str | None
    source_url: str | None
    detected_at: str
    affected_files: list[dict]
    affected_sdks: list[dict]
    severity: str
    confidence: float
    impact_reason: str | None
    expected_behavior: str | None
    potential_failure: str | None
    recommended_fix: str | None
    fix_diff: str | None
    fix_status: str
    verification_status: str
    verification_details: dict
    scan_id: str | None
    created_at: str


class ImpactListResponse(BaseModel):
    analyses: list[ImpactAnalysisResponse]
    total: int


class FixGenerationResponse(BaseModel):
    success: bool
    fixes: list[dict]
    message: str


# --- Endpoints ---

@router.get("/repos/{repo_id}", response_model=ImpactListResponse)
def list_repo_impact_analyses(
    repo_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    severity: str | None = Query(default=None),
    user_id: str = Depends(get_current_user_id),
) -> ImpactListResponse:
    """List all impact analyses for a repository."""
    # Verify ownership
    _owned_repo(user_id, repo_id)
    
    analyses = get_repo_impact_analyses(repo_id, limit, offset, severity)
    
    # Get total count
    count_query = (
        db()
        .table("impact_analyses")
        .select("id", count="exact")
        .eq("repo_id", repo_id)
    )
    if severity:
        count_query = count_query.eq("severity", severity)
    
    total = count_query.execute().count or 0
    
    return ImpactListResponse(
        analyses=[_to_response(a) for a in analyses],
        total=total,
    )


@router.get("/analyses/{analysis_id}", response_model=ImpactAnalysisResponse)
def get_analysis(
    analysis_id: str,
    user_id: str = Depends(get_current_user_id),
) -> ImpactAnalysisResponse:
    """Get a specific impact analysis."""
    analysis = get_impact_analysis(analysis_id)
    
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    # Verify ownership
    if analysis.repo_id:
        _owned_repo(user_id, analysis.repo_id)
    
    return _to_response(analysis)


@router.post("/analyze-event", response_model=ImpactAnalysisResponse)
def analyze_changelog_event_endpoint(
    request: AnalyzeEventRequest,
    user_id: str = Depends(get_current_user_id),
) -> ImpactAnalysisResponse:
    """Analyze a changelog event against a repository."""
    # Verify repo ownership
    _owned_repo(user_id, request.repo_id)
    
    # Get changelog event
    event_result = (
        db()
        .table("changelog_events")
        .select("*")
        .eq("id", request.changelog_event_id)
        .limit(1)
        .execute()
    )
    
    if not event_result.data:
        raise HTTPException(status_code=404, detail="Changelog event not found")
    
    event = event_result.data[0]
    
    # Get repo detections
    detections_result = (
        db()
        .table("api_detections")
        .select("*")
        .eq("repo_id", request.repo_id)
        .execute()
    )
    
    detections = detections_result.data or []
    
    # Get repo packages (from recent scan stats)
    repo_packages = _get_repo_packages(request.repo_id)
    
    # Run analysis
    analysis = analyze_changelog_event(
        event=event,
        repo_id=request.repo_id,
        detections=detections,
        repo_packages=repo_packages,
    )
    
    # Persist
    analysis_id = persist_impact_analysis(analysis)
    analysis.id = analysis_id
    
    return _to_response(analysis)


@router.post("/fire-drill", response_model=ImpactAnalysisResponse)
def fire_drill_endpoint(
    request: FireDrillRequest,
    user_id: str = Depends(get_current_user_id),
) -> ImpactAnalysisResponse:
    """Run Fire Drill analysis for a repository and provider.
    
    Analyzes the repository against known third-party API contracts/changes
    and answers: "Is this deployment likely to break because of an external API?"
    """
    # Verify repo ownership
    _owned_repo(user_id, request.repo_id)
    
    # Get repo detections
    detections_result = (
        db()
        .table("api_detections")
        .select("*")
        .eq("repo_id", request.repo_id)
        .eq("api_name", request.provider)
        .execute()
    )
    
    detections = detections_result.data or []
    
    # Run analysis
    analysis = analyze_repo_for_provider(
        repo_id=request.repo_id,
        provider=request.provider,
        detections=detections,
    )
    
    # Persist — degrade gracefully if the impact_analyses table is not
    # migrated yet on this environment (apply migration via Supabase SQL
    # Editor to enable persistence).
    analysis_id = None
    try:
        analysis_id = persist_impact_analysis(analysis)
        analysis.id = analysis_id
    except Exception as exc:  # noqa: BLE001 — fire drill must not 500 on missing table
        print(f"Fire drill persist skipped for repo={request.repo_id}: {exc}")
    
    return _to_response(analysis)


@router.post("/fire-drill-matrix")
def fire_drill_matrix_endpoint(
    request: FireDrillMatrixRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Run a Fire Drill across ALL monitored providers for a repository.

    Each provider is classified against real evidence only:
      - active:   repo has real detected usage AND a recent changelog event
      - at_risk:  repo has real detected usage but no recent event (usage exists,
                  no known change yet)
      - unknown:  provider events exist but no repo usage found
      - inactive: no usage, no recent events

    Never fabricates data: every classification is derived from the repo's own
    api_detections and the changelog_events table.
    """
    _owned_repo(user_id, request.repo_id)

    try:
        from ..changelog.sources import PROVIDER_SOURCES
        provider_ids = [p.id for p in PROVIDER_SOURCES]
    except Exception:
        # Fallback if the registry import path ever changes
        from ..signatures import MONITORED_APIS
        provider_ids = sorted(MONITORED_APIS)

    # Historical window for "recent" changelog events (real timestamps).
    from datetime import datetime, timedelta, timezone
    recent_since = (datetime.now(timezone.utc) - timedelta(days=365)).isoformat()

    rows_out: list[dict] = []
    active = at_risk = unknown = inactive = 0

    for pid in provider_ids:
        detections_result = (
            db()
            .table("api_detections")
            .select("id")
            .eq("repo_id", request.repo_id)
            .eq("api_name", pid)
            .limit(1)
            .execute()
        )
        has_usage = bool(detections_result.data)

        events_result = (
            db()
            .table("changelog_events")
            .select("id, severity, detected_at")
            .eq("api_name", pid)
            .gte("detected_at", recent_since)
            .order("detected_at", desc=True)
            .limit(5)
            .execute()
        )
        events = events_result.data or []

        if has_usage and events:
            status = "active"
            active += 1
        elif has_usage:
            status = "at_risk"
            at_risk += 1
        elif events:
            status = "unknown"
            unknown += 1
        else:
            status = "inactive"
            inactive += 1

        rows_out.append({
            "provider": pid,
            "status": status,
            "usage_detected": has_usage,
            "recent_events": len(events),
            "latest_event": (events[0] or {}).get("detected_at"),
        })

    return {
        "repo_id": request.repo_id,
        "providers": rows_out,
        "total": len(provider_ids),
        "summary": {
            "active": active,
            "at_risk": at_risk,
            "unknown": unknown,
            "inactive": inactive,
        },
    }


@router.post("/generate-fix", response_model=FixGenerationResponse)
def generate_fix_endpoint(
    request: GenerateFixRequest,
    user_id: str = Depends(get_current_user_id),
) -> FixGenerationResponse:
    """Generate a fix for an impact analysis."""
    # Get analysis
    analysis = get_impact_analysis(request.analysis_id)
    
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    # Verify ownership
    if analysis.repo_id:
        _owned_repo(user_id, analysis.repo_id)
    
    # Filter affected files if specific file requested
    affected_files = [
        f.__dict__ for f in analysis.affected_files
    ]
    
    if request.file_path:
        affected_files = [
            f for f in affected_files
            if f.get("file_path") == request.file_path
        ]
        
        if not affected_files:
            raise HTTPException(
                status_code=404,
                detail=f"File {request.file_path} not found in affected files",
            )
    
    # Generate fixes
    fixes = generate_fixes_for_analysis(
        affected_files=affected_files,
        change_type=analysis.change_type,
        provider=analysis.provider,
    )
    
    if not fixes:
        return FixGenerationResponse(
            success=False,
            fixes=[],
            message="No automated fix available for this change",
        )
    
    # Update analysis with fix
    fix = fixes[0]
    analysis.recommended_fix = fix.description
    analysis.fix_diff = fix.diff
    analysis.fix_status = "generated"
    
    # Persist updated analysis
    db().table("impact_analyses").update({
        "recommended_fix": fix.description,
        "fix_diff": fix.diff,
        "fix_status": "generated",
        "updated_at": _now_iso(),
    }).eq("id", analysis.id).execute()
    
    return FixGenerationResponse(
        success=True,
        fixes=[{
            "file_path": fix.file_path,
            "old_value": fix.old_value,
            "new_value": fix.new_value,
            "diff": fix.diff,
            "confidence": fix.confidence,
            "description": fix.description,
        }],
        message="Fix generated successfully",
    )


@router.get("/summary")
def get_impact_summary(
    repository_id: str | None = Query(None),
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Get impact analysis summary for dashboard.

    When repository_id is provided the summary is scoped to that ONE repository
    (ownership enforced — 404 for unowned repos, IDOR-safe). Without it the
    summary aggregates across all of the user's repositories.
    """
    # Get all repos for user
    repos_result = (
        db()
        .table("repos")
        .select("id")
        .eq("user_id", user_id)
        .execute()
    )

    repo_ids = [r["id"] for r in (repos_result.data or [])]

    if repository_id:
        # Ownership-checked scope: unowned repo -> 404 (never leak rows).
        # This check happens BEFORE the empty-repos return so that requesting a
        # repository the user cannot own always 404s, never silently returns
        # an empty aggregate.
        owned = {r["id"] for r in (repos_result.data or [])}
        if repository_id not in owned:
            raise HTTPException(status_code=404, detail="Repository not found")
        repo_ids = [repository_id]

    if not repo_ids:
        return {
            "total_analyses": 0,
            "by_severity": {},
            "recent_analyses": [],
            "affected_repos": 0,
        }

    # Get analyses for the scoped repo(s)
    analyses_result = (
        db()
        .table("impact_analyses")
        .select("*")
        .in_("repo_id", repo_ids)
        .order("detected_at", desc=True)
        .limit(100)
        .execute()
    )
    
    analyses = analyses_result.data or []
    
    # Calculate summary
    by_severity = {}
    affected_repos = set()
    
    for a in analyses:
        sev = a.get("severity", "unknown")
        by_severity[sev] = by_severity.get(sev, 0) + 1
        affected_repos.add(a.get("repo_id"))
    
    return {
        "total_analyses": len(analyses),
        "by_severity": by_severity,
        "recent_analyses": [_to_response_dict(a) for a in analyses[:10]],
        "affected_repos": len(affected_repos),
    }


# --- Helpers ---

def _owned_repo(user_id: str, repo_id: str) -> dict:
    """Verify repo ownership and return repo row."""
    result = (
        db()
        .table("repos")
        .select("id, full_name, access_token, default_branch")
        .eq("id", repo_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    return result.data[0]


def _get_repo_packages(repo_id: str) -> list[str]:
    """Get package names from repo's recent scan stats."""
    result = (
        db()
        .table("scans")
        .select("stats")
        .eq("repo_id", repo_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    
    if not result.data:
        return []
    
    stats = result.data[0].get("stats") or {}
    if isinstance(stats, str):
        import json
        stats = json.loads(stats)
    
    # Extract packages from stats if available
    return stats.get("packages", [])


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def _to_response(analysis: ImpactAnalysis) -> ImpactAnalysisResponse:
    """Convert ImpactAnalysis to response model."""
    return ImpactAnalysisResponse(
        id=analysis.id or "",
        repo_id=analysis.repo_id or "",
        changelog_event_id=analysis.changelog_event_id,
        provider=analysis.provider,
        api_endpoint=analysis.api_endpoint,
        change_type=analysis.change_type,
        change_description=analysis.change_description,
        source_url=analysis.source_url,
        detected_at=analysis.detected_at,
        affected_files=[{
            "file_path": f.file_path,
            "line_number": f.line_number,
            "function_name": f.function_name,
            "class_name": f.class_name,
            "snippet": f.snippet,
            "api_endpoint": f.api_endpoint,
            "sdk_package": f.sdk_package,
            "sdk_version": f.sdk_version,
            "workflow": f.workflow,
            "reason": f.reason,
        } for f in analysis.affected_files],
        affected_sdks=analysis.affected_sdks,
        severity=analysis.severity,
        confidence=analysis.confidence,
        impact_reason=analysis.impact_reason,
        expected_behavior=analysis.expected_behavior,
        potential_failure=analysis.potential_failure,
        recommended_fix=analysis.recommended_fix,
        fix_diff=analysis.fix_diff,
        fix_status=analysis.fix_status,
        verification_status=analysis.verification_status,
        verification_details=analysis.verification_details,
        scan_id=analysis.scan_id,
        created_at=analysis.created_at,
    )


def _to_response_dict(row: dict) -> dict:
    """Convert database row to response dict."""
    return {
        "id": row.get("id"),
        "repo_id": row.get("repo_id"),
        "provider": row.get("provider"),
        "change_type": row.get("change_type"),
        "severity": row.get("severity"),
        "confidence": row.get("confidence"),
        "detected_at": row.get("detected_at"),
    }
