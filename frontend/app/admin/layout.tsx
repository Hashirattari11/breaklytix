import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ReactNode } from "react";
import AdminShell from "./AdminShell";

/**
 * Server-enforced gate for every /admin route.
 *
 * The httpOnly `bx_session` cookie is issued by POST /api/session only after
 * the backend validated the Bearer token. Here the server re-verifies that
 * token against the authoritative API and checks `is_admin` before rendering
 * any admin markup. The API endpoints remain the data boundary (they return
 * 401/403 independently), so a forged or stale cookie cannot read admin data.
 */
export const dynamic = "force-dynamic";

const API_BASE =
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8000";

type AdminState = "admin" | "forbidden" | "unauthenticated";

async function checkAdmin(token: string): Promise<AdminState> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    // 401 = invalid/expired token, 403 = suspended account: both must sign in.
    if (res.status === 401 || res.status === 403) return "unauthenticated";
    if (!res.ok) return "unauthenticated";
    const user = (await res.json()) as { is_admin?: boolean };
    return user?.is_admin ? "admin" : "forbidden";
  } catch {
    // Fail closed: never render the admin shell when role cannot be verified.
    return "unauthenticated";
  }
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const token = cookies().get("bx_session")?.value;
  if (!token) {
    redirect("/login?next=%2Fadmin");
  }

  const state = await checkAdmin(token);
  if (state === "unauthenticated") {
    redirect("/login?next=%2Fadmin");
  }
  if (state === "forbidden") {
    return (
      <main className="p-page" style={{ maxWidth: 560, margin: "80px auto", textAlign: "center" }}>
        <p
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--muted)",
            margin: 0,
          }}
        >
          403
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: "10px 0 12px" }}>
          Admin access required
        </h1>
        <p style={{ color: "var(--muted)", lineHeight: 1.6, marginBottom: 24 }}>
          You are signed in, but this account does not have administrator
          permissions.
        </p>
        <Link href="/dashboard" className="btn btn-primary">
          Back to dashboard
        </Link>
      </main>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
