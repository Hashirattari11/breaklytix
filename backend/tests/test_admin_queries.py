"""Regression tests for admin endpoint query discipline.

Background: /admin/users used to scan the ENTIRE repos table and /admin/overview
loaded every alerts row into Python to count statuses. Both now use bounded,
server-side queries (chunked `in_(user_id, ...)` filters and PostgREST exact
counts). These tests pin that behavior so it cannot quietly regress.
"""
from types import SimpleNamespace

import pytest

from app.routers import admin as admin_mod


class FakeQuery:
    """Fluent fake recording every op for assertions."""

    def __init__(self, store, table):
        self._store = store
        self._table = table
        self.ops = []

    def select(self, *cols, **kwargs):
        self.ops.append(("select", cols, kwargs))
        return self

    def order(self, *cols, **kwargs):
        self.ops.append(("order", cols, kwargs))
        return self

    def limit(self, n):
        self.ops.append(("limit", n, {}))
        return self

    def eq(self, col, val):
        self.ops.append(("eq", col, val, {}))
        return self

    def neq(self, col, val):
        self.ops.append(("neq", col, val, {}))
        return self

    def in_(self, col, vals):
        self.ops.append(("in_", col, list(vals), {}))
        return self

    def execute(self):
        self._store.setdefault("queries", []).append((self._table, list(self.ops)))
        data = list(self._store.get("data", {}).get(self._table, []))
        # Model PostgREST semantics: apply recorded in_/eq filters to the rows.
        for op in self.ops:
            if op[0] == "in_" and isinstance(data, list) and data and isinstance(data[0], dict):
                data = [row for row in data if row.get(op[1]) in op[2]]
            elif op[0] == "eq" and isinstance(data, list) and data and isinstance(data[0], dict):
                data = [row for row in data if row.get(op[1]) == op[2]]
        count = self._store.get("counts", {}).get(self._table)
        return SimpleNamespace(data=data, count=count)


class FakeDB:
    """db() stand-in; `store` captures per-table queries for assertions."""

    def __init__(self, data=None, counts=None):
        self.store = {"data": data or {}, "counts": counts or {}, "queries": []}

    def table(self, name):
        return FakeQuery(self.store, name)

    def queries_for(self, table):
        return [ops for (t, ops) in self.store["queries"] if t == table]


def _user(i: int) -> dict:
    return {
        "id": f"u{i:03d}",
        "email": f"user{i}@example.com",
        "github_login": f"user{i}",
        "plan": "free",
        "is_admin": False,
        "is_agency": False,
        "created_at": "2026-01-01T00:00:00Z",
        "is_suspended": False,
        "suspended_at": None,
        "suspended_reason": None,
    }


@pytest.fixture
def fake_db(monkeypatch):
    """Patch admin.db with a recording FakeDB factory."""
    holder: dict = {}

    def _install(data=None, counts=None):
        fake = FakeDB(data=data, counts=counts)
        holder["fake"] = fake
        monkeypatch.setattr(admin_mod, "db", lambda: fake)
        return fake

    return _install


# ---------------------------------------------------------------------------
# /admin/users — chunked, bounded repos fetch
# ---------------------------------------------------------------------------
def test_admin_users_fetches_repos_in_chunks(fake_db):
    users = [_user(i) for i in range(250)]  # > chunk size (100) => 3 chunks
    repos = [
        {"id": "r1", "user_id": "u100", "full_name": "o/r1", "default_branch": "main",
         "connected_at": None, "last_scanned_at": None},
        {"id": "r2", "user_id": "u249", "full_name": "o/r2", "default_branch": "main",
         "connected_at": None, "last_scanned_at": None},
    ]
    fake = fake_db(data={"users": users, "repos": repos})
    # NOTE: status=None must be explicit — the raw function's FastAPI default
    # is a truthy Query(None) object when called outside the request cycle.
    result = admin_mod.admin_users(limit=250, search=None, status=None)
    repo_queries = fake.queries_for("repos")
    assert len(repo_queries) == 3, "repos must be fetched in 3 bounded chunks"
    covered = []
    for ops in repo_queries:
        in_ops = [op for op in ops if op[0] == "in_"]
        assert in_ops, "every repos query must be bounded by an in_(user_id, ...) filter"
        assert in_ops[0][1] == "user_id"
        covered.extend(in_ops[0][2])
    assert len(covered) == 250 and set(covered) == {u["id"] for u in users}
    by_id = {u["id"]: u for u in result["users"]}
    assert by_id["u100"]["repository_count"] == 1
    assert by_id["u249"]["repository_count"] == 1
    assert by_id["u001"]["repository_count"] == 0


def test_admin_users_search_filters_in_memory(fake_db):
    users = [_user(1), _user(2)]
    fake_db(data={"users": users, "repos": []})
    result = admin_mod.admin_users(search="user2", status=None)
    assert [u["email"] for u in result["users"]] == ["user2@example.com"]


# ---------------------------------------------------------------------------
# /admin/overview — server-side exact counts, no full alerts scan
# ---------------------------------------------------------------------------
def test_admin_overview_uses_exact_counts(fake_db):
    fake = fake_db(counts={"users": 7, "repos": 3, "alerts": 4})
    overview = admin_mod.admin_overview()
    alerts_queries = fake.queries_for("alerts")
    assert len(alerts_queries) == 4, "four filtered count queries expected"
    for ops in alerts_queries:
        selects = [op for op in ops if op[0] == "select"]
        assert selects and selects[0][2].get("count") == "exact"
        assert any(op[0] == "eq" for op in ops), "each count must be filtered"
    assert overview["total_users"] == 7
    assert overview["total_repos"] == 3


# ---------------------------------------------------------------------------
# /admin/funnel — share click breakdown via JSONB props
# ---------------------------------------------------------------------------
def test_admin_funnel_share_breakdown_is_shape_correct(fake_db):
    fake_db()
    funnel = admin_mod.admin_funnel()
    breakdown = funnel.get("share_breakdown")
    assert breakdown is not None, "funnel response must include a share breakdown"
    assert set(breakdown["by_platform"]) == {"x", "linkedin", "copy"}
    assert isinstance(breakdown["with_risks"], int)
    assert isinstance(breakdown["without_risks"], int)
