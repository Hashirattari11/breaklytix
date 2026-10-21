import { ReactNode } from "react";
import DashboardShell from "./DashboardShell";

/**
 * Server layout for the authenticated dashboard.
 *
 * This file exists only to hold `dynamic = "force-dynamic"`. The dashboard UI
 * itself is a Client Component (it reads useSearchParams and per-user auth
 * state), and Next.js ignores route-segment config exported from Client
 * Components. Keeping the export here means the flag still applies to every
 * /dashboard route while the public marketing pages are free to be static.
 */
export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
