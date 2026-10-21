/** @type {import('next').NextConfig} */
// ALLOW_LOCAL_API=1 (build-time only) whitelists http://localhost:8000 in
// connect-src so the local mock API (scripts/mock-api.py) can serve fixtures
// for offline UI width audits. Production/Vercel builds never set it, so the
// CSP there stays exactly as before.
const localApiSrc = process.env.ALLOW_LOCAL_API === "1" ? " http://localhost:8000" : "";

// `next dev` ships Next's React Refresh runtime, which evaluates strings as
// code. The production bundle never includes that runtime, so 'unsafe-eval' is
// ONLY ever added to the local dev server's CSP. Without it the strict CSP
// aborts the client bundle mid-hydration (EvalError in react-refresh-utils),
// leaving every IntersectionObserver reveal stuck at opacity:0 — the landing
// page renders with whole sections invisible in dev. Vercel builds keep the
// strict CSP exactly as before, mirroring the ALLOW_LOCAL_API convention above.
const scriptSrc =
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

// Marketing / documentation routes that render the same HTML for everyone.
// Login, auth, dashboard and admin are deliberately absent — they are private.
const PUBLIC_CACHE_PATHS = [
  "/",
  "/about",
  "/providers",
  "/pricing",
  "/docs",
  "/docs/:slug*",
  "/contact",
  "/privacy",
  "/terms",
  "/security",
  "/acceptable-use",
  "/cookies",
];
const nextConfig = {
  reactStrictMode: true,
  // The two legal stubs under /docs duplicated /privacy and /terms (thin pages,
  // identical titles, two URLs for one policy). They were removed from the docs
  // registry and consolidated onto the canonical legal routes.
  async redirects() {
    return [
      { source: "/docs/privacy-policy", destination: "/privacy", permanent: true },
      { source: "/docs/terms-of-service", destination: "/terms", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              // No external images exist anywhere in the app (only /logo.png,
              // verified: no <img> with a dynamic src, no next/image, no url()
              // to a remote host). The `https:` wildcard only widened the
              // surface for an attacker-controlled image URL, so it is gone —
              // this resolves ZAP's "CSP: Wildcard Directive" (Medium).
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://backend-virid-ten-43.vercel.app https://api.github.com https://github.com" + localApiSrc,
              "frame-src 'self'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          // Belt-and-braces (Vercel already sends HSTS / X-Content-Type-Options).
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      // Public, non-personalised pages. The root layout sets
      // `dynamic = "force-dynamic"` (required so dashboard routes never
      // prerender a tree that reads useSearchParams), which makes Next emit
      // `Cache-Control: private, no-store` for every route — including these.
      // A crawler then costs a full server render on every hit. These pages are
      // identical for every visitor, so they are safe to share at the edge.
      ...PUBLIC_CACHE_PATHS.map((source) => ({
        source,
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
          },
        ],
      })),
    ];
  },
};

module.exports = nextConfig;