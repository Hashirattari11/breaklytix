// Shared presentational helpers for the public scan result page.
//
// These live outside ScanResultClient.tsx on purpose: that file is a client
// component, and importing plain functions/objects from a "use client" module
// into a server component hands back client references. Calling them while
// rendering on the server throws, which 500'd every scan that detected a
// provider. Keeping them in a plain module lets both the server page and the
// client island use the exact same styling.
import type { CSSProperties } from "react";

export function confidenceStyle(confidence: string): CSSProperties {
  if (confidence === "high") {
    return { background: "rgba(239,68,68,0.12)", color: "#b91c1c", border: "1px solid rgba(239,68,68,0.3)" };
  }
  if (confidence === "medium") {
    return { background: "rgba(245,158,11,0.12)", color: "#b45309", border: "1px solid rgba(245,158,11,0.3)" };
  }
  return { background: "rgba(107,114,128,0.12)", color: "#4b5563", border: "1px solid rgba(107,114,128,0.25)" };
}

export const pill: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  textTransform: "capitalize",
  lineHeight: 1.6,
};
