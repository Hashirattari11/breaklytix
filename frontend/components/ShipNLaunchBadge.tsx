/* eslint-disable @next/next/no-img-element -- static third-party badge SVG, no
   next/image remotePatterns entry needed for a fixed-size 240x56 asset. */
import { SHIPNLAUNCH_URL, SHIPNLAUNCH_BADGE_SRC } from "@/lib/site";

/**
 * "Featured on ShipNLaunch" listing badge.
 *
 * Same constraints as LaunchstagBadge: plain anchor + <img> (not next/image)
 * because the asset is a fixed-size third-party SVG served by ShipNLaunch.
 * `rel="noopener noreferrer"` as the listing asks for.
 *
 * Deliberately NOT `loading="lazy"`: a below-the-fold lazy image is never
 * requested until the visitor scrolls to the footer, so directory verifiers
 * see a 0x0 image. The asset is a couple of KB.
 */
export default function ShipNLaunchBadge({ style }: { style?: React.CSSProperties }) {
  return (
    <a
      href={SHIPNLAUNCH_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Featured on ShipNLaunch"
      style={{ display: "inline-block", lineHeight: 0, ...style }}
    >
      <img
        src={SHIPNLAUNCH_BADGE_SRC}
        alt="Featured on ShipNLaunch"
        width={240}
        height={56}
        decoding="async"
        style={{ display: "block", height: 56, width: 240 }}
      />
    </a>
  );
}
