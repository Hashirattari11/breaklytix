/** @type {import('next').NextConfig} */
// ALLOW_LOCAL_API=1 (build-time only) whitelists http://localhost:8000 in
// connect-src so the local mock API (scripts/mock-api.py) can serve fixtures
// for offline UI width audits. Production/Vercel builds never set it, so the
// CSP there stays exactly as before.
const localApiSrc = process.env.ALLOW_LOCAL_API === "1" ? " http://localhost:8000" : "";
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
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
    ];
  },
};

module.exports = nextConfig;