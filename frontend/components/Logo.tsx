// Breaklytix brand logo — official bolt "B" mark, pre-cropped from the full
// logo so pages download a 3.5 KB mark instead of the 55 KB wordmark asset.
// The full logo stays at /logo.png for JSON-LD and the web manifest.
type LogoProps = {
  size?: number;
  withWordmark?: boolean;
  className?: string;
};

export function LogoMark({ size = 32, withWordmark = false, className }: LogoProps) {
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
      <span
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.28),
          overflow: "hidden",
          flexShrink: 0,
          boxShadow: "0 2px 8px rgba(99, 91, 255, 0.35)",
          background: "#0b0b14",
          display: "inline-block",
          position: "relative",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-mark.webp"
          alt="Breaklytix"
          width={size}
          height={size}
          style={{ width: size, height: size, display: "block", objectFit: "cover" }}
        />
      </span>
      {withWordmark && (
        <span style={{ fontWeight: 800, fontSize: Math.round(size * 0.55), letterSpacing: "-0.01em", color: "inherit" }}>
          Breaklytix
        </span>
      )}
    </span>
  );
}
