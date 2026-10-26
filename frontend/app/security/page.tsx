import type { Metadata } from "next";
import LegalLayout, { LegalSection, LegalTitle } from "@/components/LegalLayout";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { SITE_NAME, SITE_URL, SUPPORT_EMAIL, pageOpenGraph } from "@/lib/site";

export const metadata: Metadata = {
  title: "Security & Data Protection",
  description:
    `How ${SITE_NAME} protects your data: encrypted credentials, OAuth authentication, scoped GitHub access, access control, and secure logging.`,
  alternates: { canonical: SITE_URL + "/security" },
  robots: { index: true, follow: true },
  openGraph: pageOpenGraph("/security"),
};

const TOC = [
  { id: "overview", label: "1. Overview" },
  { id: "credentials", label: "2. API Credential Protection" },
  { id: "encryption", label: "3. Encryption" },
  { id: "authentication", label: "4. Authentication" },
  { id: "authorization", label: "5. Authorization" },
  { id: "github-permissions", label: "6. GitHub Permissions" },
  { id: "secret-handling", label: "7. Secret Handling" },
  { id: "access-control", label: "8. Access Control" },
  { id: "logging", label: "9. Logging" },
  { id: "data-isolation", label: "10. Data Isolation" },
  { id: "monitoring", label: "11. Security Monitoring" },
  { id: "reporting", label: "12. Reporting a Vulnerability" },
];

export default function SecurityPage() {
  return (
    <LegalLayout>
      <BreadcrumbJsonLd name="Security & Data Protection" path="/security" />
      <LegalTitle
        title="Security"
        updated="September 8, 2026"
        intro={`This page describes the security measures ${SITE_NAME} actually implements. We do not claim certifications we have not obtained.`}
        toc={TOC}
      />

      <LegalSection id="overview" title="1. Overview">
        <p>
          {SITE_NAME} handles two sensitive categories of data: GitHub access tokens (used to scan your repositories
          and open auto-fix pull requests) and API keys you add for provider monitoring. We apply the same basic
          principle to both: credentials are encrypted before storage, never exposed to the browser, and scoped to
          what the feature needs.
        </p>
      </LegalSection>

      <LegalSection id="credentials" title="2. API Credential Protection">
        <ul style={{ paddingLeft: 20 }}>
          <li>Provider API keys and GitHub tokens are encrypted before they are stored (Fernet, AES-128-CBC with HMAC). The encryption key exists only in the server environment, never in the database or the browser.</li>
          <li>Credentials are never returned to the frontend. The UI shows only safe metadata: provider name, connection status, and a masked identifier.</li>
          <li>Credentials never appear in URLs, emails, or logs.</li>
        </ul>
      </LegalSection>

      <LegalSection id="encryption" title="3. Encryption">
        <ul style={{ paddingLeft: 20 }}>
          <li><strong>In transit:</strong> all traffic uses HTTPS/TLS.</li>
          <li><strong>At rest:</strong> data is stored in a hosted PostgreSQL database (Supabase) with encryption at rest.</li>
          <li><strong>Credentials:</strong> symmetric encryption (Fernet / AES-128-CBC with HMAC) as described above.</li>
        </ul>
      </LegalSection>

      <LegalSection id="authentication" title="4. Authentication">
        <ul style={{ paddingLeft: 20 }}>
          <li>Sign-in uses GitHub OAuth 2.0. We never see or store your GitHub password.</li>
          <li>After OAuth, the backend issues a signed session token valid for 30 days that the frontend keeps in browser storage. Signing out clears it from that browser.</li>
          <li>The frontend&apos;s GitHub OAuth flow uses a random one-time state value to prevent request forgery.</li>
        </ul>
      </LegalSection>

      <LegalSection id="authorization" title="5. Authorization">
        <ul style={{ paddingLeft: 20 }}>
          <li>Every API route resolves the authenticated user server-side; queries are scoped to that user&apos;s ownership (repositories, provider connections, alerts).</li>
          <li>Admin-only routes require an admin flag verified server-side.</li>
          <li>Internal/background endpoints require a shared secret; debug endpoints are additionally protected.</li>
        </ul>
      </LegalSection>

      <LegalSection id="github-permissions" title="6. GitHub Permissions">
        <ul style={{ paddingLeft: 20 }}>
          <li>We access GitHub only through the permissions you grant when you connect a repository.</li>
          <li>Repository scanning reads metadata and source files needed to detect API usage.</li>
          <li>Auto-fix may create branches and open pull requests in repositories you connect — only after you authorize the connection. Pull requests are never merged automatically; you review and merge them.</li>
          <li>You can revoke the application&apos;s GitHub access at any time from your GitHub account settings.</li>
        </ul>
      </LegalSection>

      <LegalSection id="secret-handling" title="7. Secret Handling">
        <ul style={{ paddingLeft: 20 }}>
          <li>Server secrets (database service-role key, encryption key, OAuth secret, email/billing keys) are configured in the hosting environment and never compiled into client code.</li>
          <li>Public-build variables are limited to what the browser genuinely needs (API base URL and the GitHub OAuth client ID, which is public by design).</li>
          <li>Diagnostic endpoints return partial values only (e.g. a prefix) and only when the internal secret is supplied.</li>
        </ul>
      </LegalSection>

      <LegalSection id="access-control" title="8. Access Control">
        <ul style={{ paddingLeft: 20 }}>
          <li>Cross-origin requests are restricted to an allow-list of frontend origins (including preview domains); credentials are not shared cross-origin.</li>
          <li>Requests that fail validation or authentication receive generic error messages that do not reveal internal details.</li>
        </ul>
      </LegalSection>

      <LegalSection id="logging" title="9. Logging">
        <p>
          We keep limited diagnostic logs to operate and debug the service. Logs never include tokens, API keys,
          passwords, or repository contents. Error responses returned to the browser are deliberately generic and
          contain no secrets.
        </p>
      </LegalSection>

      <LegalSection id="data-isolation" title="10. Data Isolation">
        <p>
          Data is stored per user: provider-connection records include the owning user, and monitoring snapshots are
          scoped by user (and repository where relevant). Global provider-incident records are not tied to individual
          users. Users cannot read or modify another user&apos;s repositories, connections, or alerts.
        </p>
      </LegalSection>

      <LegalSection id="monitoring" title="11. Security Monitoring">
        <p>
          We monitor provider health and incidents surfaced through the service, review dependency security
          advisories, and ship fixes through our normal release process. We recommend keeping dependencies updated
          and watching for release notes.
        </p>
      </LegalSection>

      <LegalSection id="reporting" title="12. Reporting a Vulnerability">
        <p>
          Found a security issue? Please tell us privately before disclosing it publicly:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--accent-text, #4f46e5)" }}>{SUPPORT_EMAIL}</a>
          {" "}or open a private issue via our <a href="/contact" style={{ color: "var(--accent-text, #4f46e5)" }}>Contact page</a>.
          We investigate reports and keep reporters informed.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}