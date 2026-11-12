import { ImageResponse } from "next/og";
import { getInstantScan } from "@/lib/instant-scan";

export const alt = "Breaklytix Instant Repo Scan result";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

type ImageProps = { params: Promise<{ id: string }> };

export default async function ScanOgImage({ params }: ImageProps) {
  const { id } = await params;
  const scan = await getInstantScan(id).catch(() => null);
  const result = scan?.result;
  const repo = result?.repo || "Public repository";
  const apis = result?.summary.provider_count ?? 0;
  const risks = result?.summary.possible_risk_count ?? 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(135deg, #0e1016 0%, #151a2e 55%, #1b1440 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 16,
              background: "linear-gradient(135deg, #635bff, #06b6d4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
              fontWeight: 800,
            }}
          >
            B
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>Breaklytix</span>
            <span style={{ fontSize: 18, color: "rgba(255,255,255,0.55)" }}>Instant Repo Scan</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <span style={{ fontSize: 22, color: "#a78bfa", fontWeight: 700 }}>Public GitHub scan</span>
          <span
            style={{
              fontSize: repo.length > 34 ? 54 : 68,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              wordBreak: "break-word",
            }}
          >
            {repo}
          </span>
        </div>

        <div style={{ display: "flex", gap: 24 }}>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              padding: "22px 26px",
              borderRadius: 20,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.14)",
            }}
          >
            <span style={{ fontSize: 56, fontWeight: 800, lineHeight: 1 }}>{apis}</span>
            <span style={{ fontSize: 20, color: "rgba(255,255,255,0.6)", marginTop: 8 }}>
              API{apis === 1 ? "" : "s"} detected
            </span>
          </div>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              padding: "22px 26px",
              borderRadius: 20,
              background: risks ? "rgba(245,158,11,0.14)" : "rgba(52,211,153,0.12)",
              border: risks
                ? "1px solid rgba(245,158,11,0.4)"
                : "1px solid rgba(52,211,153,0.35)",
            }}
          >
            <span style={{ fontSize: 56, fontWeight: 800, lineHeight: 1 }}>{risks}</span>
            <span style={{ fontSize: 20, color: "rgba(255,255,255,0.6)", marginTop: 8 }}>
              possible risk{risks === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 22, color: "rgba(255,255,255,0.55)" }}>
            Scan yours free — no account needed
          </span>
          <span style={{ fontSize: 26, fontWeight: 700, color: "#a78bfa" }}>breaklytix.site</span>
        </div>
      </div>
    ),
    size,
  );
}
