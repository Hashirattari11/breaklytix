"use client";

import dynamic from "next/dynamic";

const DashboardClient = dynamic(() => import("./DashboardClient"), {
  ssr: false,
  loading: () => (
    <main className="container page">
      <div className="card" style={{ textAlign: "center", padding: 60 }}>
        <div className="spinner" aria-label="loading" />
      </div>
    </main>
  ),
});

export default function DashboardPage() {
  return <DashboardClient />;
}