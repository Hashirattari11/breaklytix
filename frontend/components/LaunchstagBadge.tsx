/* eslint-disable @next/next/no-img-element -- static third-party badge SVG, no
   next/image remotePatterns entry needed for a fixed-size 198x62 asset. */
import { LAUNCHSTAG_URL, LAUNCHSTAG_BADGE_SRC } from "@/lib/site";

/**
 * "Featured on Launchstag" listing badge.
 *
 * Plain anchor + <img> (not next/image) because the asset is a fixed-size
 * third-party SVG served by Launchstag. `rel="noopener"` only — the listing
 * asks for a dofollow link, so `nofollow` is intentionally absent.
 *
 * Deliberately NOT `loading="lazy"`: a below-the-fold lazy image is never
 * requested until the visitor scrolls to the footer, so directory verifiers
 * (and Lighthouse "image not loaded") see a 0x0 image. The asset is ~1.4 KB.
 */
export default function LaunchstagBadge({ style }: { style?: React.CSSProperties }) {
  return (
    <a
      href={LAUNCHSTAG_URL}
      target="_blank"
      rel="noopener"
      aria-label="Featured on Launchstag"
      style={{ display: "inline-block", lineHeight: 0, ...style }}
    >
      <img
        src={LAUNCHSTAG_BADGE_SRC}
        alt="Featured on Launchstag"
        width={198}
        height={62}
        decoding="async"
        style={{ display: "block", height: 62, width: 198 }}
      />
    </a>
  );
}
