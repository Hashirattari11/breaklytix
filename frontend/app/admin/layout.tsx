import { ReactNode } from "react";
import AdminShell from "./AdminShell";

/** Server layout that marks every /admin route dynamic (see DashboardShell). */
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
