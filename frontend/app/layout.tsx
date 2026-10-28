import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";
import "./premium.css";

// NOTE: no `dynamic = "force-dynamic"` here on purpose. Authenticated trees
// (dashboard, admin) opt into dynamic rendering in their own server layouts,
// because they read request-bound URL state. Setting it at the root made every
// public marketing page uncacheable (`Cache-Control: private, no-store`), so
// each crawler hit cost a full server render with no edge cache. With this
// removed, the marketing/docs pages prerender at build time and are served
// from the CDN with `s-maxage` (see PUBLIC_CACHE_PATHS in next.config.js).

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Never let a broken API catch you off guard`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  // Private-by-default: dashboard/admin/auth pages must NOT be indexed.
  // Public marketing pages override this per-page (see /, /pricing, /terms, /privacy).
  robots: { index: false, follow: false },
  // Search Console / Bing Webmaster ownership proof. Set the env var in Vercel
  // and redeploy; no code change is needed per project. Google Search Console
  // is the only way to request indexing and see real coverage data, so this
  // stays wired up permanently.
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION
      ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION }
      : undefined,
  },
  // NOTE: openGraph/twitter deliberately set NO url, title or description here.
  // A static `url: SITE_URL` in the root layout was inherited by every page, so
  // og:url pointed at the homepage for /pricing, /docs, /contact, /privacy and
  // every docs article — every social share landed on the homepage with the
  // homepage's copy. Omitting them lets Next fall back to each page's own
  // `title`/`description`/`alternates.canonical`.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // suppressHydrationWarning: the no-flash theme script mutates the
  // data-theme attribute before React hydrates — without it, every page
  // logs React hydration errors (#418/#423/#425) in production.
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className={inter.className}>
        {/* No-flash theme: applies stored/system preference before first paint.
            Runtime changes are handled by lib/theme.ts (dashboard + settings). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("autofix_theme");var d=t==="dark"||(t!=="light"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light");}catch(e){}})();`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
