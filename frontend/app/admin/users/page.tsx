"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminUser,
  disconnectAdminRepository,
  getAdminUsers,
  updateAdminUserPlan,
  updateAdminUserStatus,
} from "../../../lib/admin";
import { formatDate, Spinner } from "../../../components/ui";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "suspended">("all");
  const [error, setError] = useState<string | null>(null);
  const [degradedReason, setDegradedReason] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await getAdminUsers(search, status === "all" ? undefined : status);
      setUsers(result.users);
      setDegradedReason(result.schema_degraded ? (result.degraded_reason || "Database migration pending — some account fields are unavailable.") : null);
    } catch (e: any) {
      setUsers(null);
      setDegradedReason(null);
      setError(e?.message || "Failed to load users");
    }
  }, [search, status]);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => ({
    users: users?.length ?? 0,
    repos: (users ?? []).reduce((n, user) => n + (user.repository_count ?? 0), 0),
    suspended: (users ?? []).filter((user) => user.is_suspended).length,
  }), [users]);

  async function toggleSuspension(user: AdminUser) {
    const next = !user.is_suspended;
    const reason = next ? window.prompt("Reason for suspension (optional):") : undefined;
    if (next && reason === null) return;
    setBusy(`user:${user.id}`);
    try { await updateAdminUserStatus(user.id, next, reason || undefined); await load(); }
    catch (e: any) { setError(e?.message || "Could not update account status"); }
    finally { setBusy(null); }
  }

  async function changePlan(user: AdminUser, plan: string) {
    if (plan === (user.plan || "free")) return;
    setBusy(`plan:${user.id}`);
    try { await updateAdminUserPlan(user.id, plan); await load(); }
    catch (e: any) { setError(e?.message || "Could not update plan"); }
    finally { setBusy(null); }
  }

  async function disconnectRepo(repoId: string, fullName: string) {
    if (!window.confirm(`Disconnect ${fullName}? This removes its monitoring data.`)) return;
    setBusy(`repo:${repoId}`);
    try { await disconnectAdminRepository(repoId); await load(); }
    catch (e: any) { setError(e?.message || "Could not disconnect repository"); }
    finally { setBusy(null); }
  }

  if (users === null && !error) return <main className="container page" style={{ textAlign: "center", paddingTop: 80 }}><Spinner /> Loading…</main>;

  return (
    <main className="container page">
      <div className="row" style={{ marginBottom: 20, alignItems: "center" }}>
        <div>
          <h1>User &amp; Repository Management</h1>
          <p className="muted" style={{ margin: 0 }}>Manage accounts, plans, suspension status, and connected repositories.</p>
        </div>
        <div className="row" style={{ gap: 8, marginLeft: "auto" }}>
          <span className="badge badge-neutral">{totals.users} users</span>
          <span className="badge badge-neutral">{totals.repos} repos</span>
          {totals.suspended > 0 && <span className="badge badge-danger">{totals.suspended} suspended</span>}
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <input className="input" style={{ flex: 1, minWidth: 220 }} placeholder="Search email or GitHub login" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void load(); }} />
          <select className="input" style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Account status">
            <option value="all">All accounts</option><option value="active">Active</option><option value="suspended">Suspended</option>
          </select>
          <button className="btn btn-secondary" onClick={() => void load()}>Refresh</button>
        </div>
      </div>

      {degradedReason && <div className="card" style={{ padding: 16, marginBottom: 16, borderLeft: "4px solid #f59e0b" }}><p className="muted" style={{ margin: 0 }}><strong style={{ color: "#f59e0b" }}>Limited data:</strong> {degradedReason}</p></div>}
      {error && <div className="card" style={{ padding: 16, marginBottom: 16 }}><p className="error-text" style={{ margin: 0 }}>{error}</p></div>}
      {!users?.length ? <div className="card" style={{ padding: 32, textAlign: "center" }}><p className="muted" style={{ margin: 0 }}>No matching users.</p></div> : (
        <div className="card" style={{ padding: 0, overflow: "auto" }}>
          <table className="table responsive-cards" style={{ minWidth: 1050 }}>
            <thead><tr><th>Account</th><th>Plan</th><th>Status</th><th>Repositories</th><th>Joined</th><th>Actions</th></tr></thead>
            <tbody>{users.map((user) => (
              <tr key={user.id}>
                <td data-label="Account"><strong>{user.github_login || user.email}</strong><br /><span className="muted small">{user.email}</span>{user.is_admin && <span className="badge badge-success" style={{ marginLeft: 8 }}>admin</span>}</td>
                <td data-label="Plan"><select className="input" value={user.plan || "free"} onChange={(e) => void changePlan(user, e.target.value)} disabled={busy === `plan:${user.id}`} aria-label={`Plan for ${user.email}`}><option value="free">free</option><option value="pro">pro</option><option value="agency">agency</option><option value="enterprise">enterprise</option></select></td>
                <td data-label="Status"><span className={`badge ${user.is_suspended ? "badge-danger" : "badge-success"}`}>{user.is_suspended ? "suspended" : "active"}</span>{user.suspended_reason && <div className="muted small" style={{ marginTop: 4 }}>{user.suspended_reason}</div>}</td>
                <td data-label="Repositories">{user.repositories?.length ? <div style={{ display: "grid", gap: 6 }}>{user.repositories.map((repo) => <span key={repo.id}><a href={`/dashboard/repos/${repo.id}`}>{repo.full_name}</a> <button className="btn btn-secondary" style={{ padding: "2px 7px", fontSize: 11 }} disabled={busy === `repo:${repo.id}`} onClick={() => void disconnectRepo(repo.id, repo.full_name)}>Disconnect</button></span>)}</div> : <span className="muted">None</span>}</td>
                <td data-label="Joined" className="muted">{user.created_at ? formatDate(user.created_at) : "—"}</td>
                <td data-label="Actions"><button className={`btn ${user.is_suspended ? "btn-secondary" : "btn-danger"}`} disabled={busy === `user:${user.id}` || !!user.is_admin} onClick={() => void toggleSuspension(user)}>{user.is_suspended ? "Restore" : "Suspend"}</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </main>
  );
}
