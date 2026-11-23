import Link from "next/link";

export const metadata = {
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#0a0a0f", fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
      <div style={{ textAlign: "center", maxWidth: 440 }}>
        <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1, background: "linear-gradient(135deg, #a78bfa, #06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          404
        </div>
        <h1 style={{ color: "white", fontSize: 24, fontWeight: 700, margin: "20px 0 8px" }}>Page not found</h1>
        <p style={{ color: "#6b7280", fontSize: 15, lineHeight: 1.6, marginBottom: 28 }}>
          The page you&apos;re looking for doesn&apos;t exist or has moved. Check the URL, or head back to the dashboard.
        </p>
        <Link
          href="/"
          style={{ display: "inline-block", padding: "12px 22px", borderRadius: 10, background: "linear-gradient(135deg, #c8f542, #a8d92e)", color: "#0a0a0b", fontWeight: 600, fontSize: 14, textDecoration: "none" }}
        >
          ← Back to home
        </Link>
      </div>
    </main>
  );
}