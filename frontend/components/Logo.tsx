// Breaklytix brand logo — official logo image with the bolt "B" mark.
// The mark is cropped from the full logo (square, mark sits in the upper
// portion) via object-fit/object-position, so every size stays crisp and the
// API (size / withWordmark / className) used across the app stays unchanged.
type LogoProps = {
  size?: number;
  withWordmark?: boolean;
  className?: string;
};

export function LogoMark({ size = 32, withWordmark = false, className }: LogoProps) {
  // Zoom window: the bolt "B" mark sits around (47%, 30%) of the source image;
  // we magnify 2.6× and center that point inside the box to show only the mark.
  const zoom = 2.6;
  const markX = 0.47;
  const markY = 0.3;
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
          src="/logo.png"
          alt="Breaklytix"
          width={Math.round(size * zoom)}
          height={Math.round(size * zoom)}
          style={{
            position: "absolute",
            width: size * zoom,
            height: size * zoom,
            maxWidth: "none",
            left: size * 0.5 - size * zoom * markX,
            top: size * 0.5 - size * zoom * markY,
            display: "block",
          }}
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
