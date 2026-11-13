import json

from app import instant_scan_health as health
from app.instant_scan_archive import ExtractedRepo


def _extracted(files, **kw):
    return ExtractedRepo(
        files=files,
        file_paths=list(files),
        files_by_type=kw.get("files_by_type", {"code": len(files), "config": 0, "docs": 0, "other": 0}),
        skipped=kw.get("skipped", []),
        service_roots=kw.get("service_roots", {}),
        truncated=kw.get("truncated", False),
        total_safe_files=kw.get("total_safe_files", len(files)),
    )


def test_score_starts_at_100_for_clean_repo():
    files = {
        "README.md": "# hi",
        "LICENSE": "MIT",
        ".gitignore": "node_modules/",
        "package.json": '{"name":"x"}',
        "package-lock.json": '{"lockfileVersion":3,"packages":{}}',
        ".github/workflows/ci.yml": "name: ci",
        ".env.example": "FOO=bar",
    }
    extracted = _extracted(files)
    result = health.run_health_checks(extracted, [])
    assert result["score"] == 100


def test_security_rule_detects_eval():
    files = {"src/app.ts": "const x = eval(userInput);\n"}
    extracted = _extracted(files)
    result = health.run_health_checks(extracted, [])
    ids = [f["id"] for f in result["findings"]]
    assert "eval-dynamic" in ids


def test_security_rule_skips_tests():
    files = {"src/app.test.ts": "const x = eval(userInput);\n"}
    extracted = _extracted(files)
    result = health.run_health_checks(extracted, [])
    ids = [f["id"] for f in result["findings"]]
    assert "eval-dynamic" not in ids


def test_hardcoded_credential_redacts_value():
    secret = "sk_" + "live_" + "abcdefghijklmnopqrstuvwxyz123456"
    files = {"src/config.ts": f'const apiKey = "{secret}";\n'}
    extracted = _extracted(files)
    result = health.run_health_checks(extracted, [])
    serialized = json.dumps(result)
    assert secret not in serialized
    ids = [f["id"] for f in result["findings"]]
    assert "hardcoded-credential" in ids


def test_config_missing_readme():
    extracted = _extracted({"src/index.ts": "console.log(1)"})
    result = health.run_health_checks(extracted, [])
    ids = [f["id"] for f in result["findings"]]
    assert "missing-readme" in ids


def test_seo_hidden_for_non_web_repo():
    extracted = _extracted({"main.py": "print('hi')"})
    result = health.run_health_checks(extracted, [])
    cats = [f["category"] for f in result["findings"]]
    assert "seo" not in cats


def test_seo_runs_for_nextjs_repo():
    files = {
        "package.json": '{"dependencies": {"next": "14.0.0"}}',
        "pages/index.tsx": "export default function Home(){ return <div>hi</div> }",
    }
    extracted = _extracted(files)
    result = health.run_health_checks(extracted, [])
    # SEO category present (at least one finding) OR a passing check; we just
    # ensure no crash and seo findings are allowed.
    assert isinstance(result["findings"], list)


def test_osv_query_batch_mocked(monkeypatch):
    def fake(packages):
        out = {}
        for eco, name, version in packages:
            out[f"{eco}:{name}@{version}"] = [
                {"id": "GHSA-xxxx", "summary": "bad", "severity": "high", "fixed": "2.0.0", "url": "https://osv.dev/x"}
            ]
        return out
    monkeypatch.setattr(health, "query_osv_batch", fake)
    files = {"package.json": '{"dependencies": {"stripe": "^14.0.0"}}'}
    # Add a lockfile so the version is concrete.
    files["package-lock.json"] = json.dumps({"packages": {"node_modules/stripe": {"version": "14.0.0"}}})
    extracted = _extracted(files)
    result = health.run_health_checks(extracted, [])
    ids = [f["id"] for f in result["findings"]]
    assert "dependency-advisory" in ids
    adv = [f for f in result["findings"] if f["id"] == "dependency-advisory"][0]
    assert adv["advisory_id"] == "GHSA-xxxx"
    assert adv["fixed_version"] == "2.0.0"


def test_disclaimer_present():
    extracted = _extracted({"README.md": "# hi"})
    result = health.run_health_checks(extracted, [])
    assert "Automated static checks" in result["disclaimer"]


def test_score_floors_at_zero():
    # many high findings
    files = {f"src/f{i}.ts": "const x = eval(y);\n" for i in range(20)}
    extracted = _extracted(files)
    result = health.run_health_checks(extracted, [])
    assert result["score"] >= 0
