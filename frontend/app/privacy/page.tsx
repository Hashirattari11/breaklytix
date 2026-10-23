import type { Metadata } from "next";
import LegalLayout, { LegalSection, LegalTitle } from "@/components/LegalLayout";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { LEGAL_ADDRESS, LEGAL_ENTITY, SITE_NAME, SITE_URL, SUPPORT_EMAIL, pageOpenGraph } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy: What Data Breaklytix Stores",
  description:
    `How ${SITE_NAME} collects, uses, stores, and protects your data — GitHub OAuth sign-in, repository scanning, provider connections, email, and billing.`,
  alternates: { canonical: SITE_URL + "/privacy" },
  robots: { index: true, follow: true },
  openGraph: pageOpenGraph("/privacy"),
};

const TOC = [
  { id: "information-we-collect", label: "1. Information We Collect" },
  { id: "how-we-use", label: "2. How We Use Your Information" },
  { id: "storage-security", label: "3. Storage & Security" },
  { id: "retention", label: "4. Data Retention" },
  { id: "third-parties", label: "5. Third-Party Services" },
  { id: "analytics-cookies", label: "6. Analytics & Cookies" },
  { id: "your-rights", label: "7. Your Rights & Data Deletion" },
  { id: "changes", label: "8. Changes to This Policy" },
  { id: "contact", label: "9. Contact" },
];

export default function PrivacyPage() {
  return (
    <LegalLayout>
      <BreadcrumbJsonLd name="Privacy Policy" path="/privacy" />
      <LegalTitle
        title="Privacy Policy"
        updated="September 8, 2026"
        intro={`This policy explains what ${SITE_NAME} collects, why we collect it, and how it is protected. It applies to the ${SITE_NAME} website and service.`}
        toc={TOC}
      />

      <LegalSection id="information-we-collect" title="1. Information We Collect">
        <ul style={{ paddingLeft: 20 }}>
          <li><strong>Account information.</strong> When you sign in with GitHub, we receive and store your email address, GitHub user ID, and GitHub username. We do not store passwords — sign-in is handled through GitHub OAuth.</li>
          <li><strong>Repository information.</strong> For repositories you connect, we store repository names and metadata, scan results (detected third-party API usage, dependency versions, and reliability findings), and the issues/alerts derived from them. We fetch source file contents only to perform a scan; scan results are stored, not the full file contents.</li>
          <li><strong>Provider connection metadata.</strong> When you connect an API provider (for example OpenAI or GitHub), we store the provider name, connection status, a masked identifier, and metadata about usage, quota, and rate-limit snapshots.</li>
          <li><strong>API credentials.</strong> Provider API keys and GitHub access tokens you authorize are encrypted before being stored (Fernet, AES-128-CBC with HMAC). Full credentials are never returned to the browser and never exposed in URLs, emails, or logs.</li>
          <li><strong>Usage information.</strong> We store snapshots of usage and rate-limit data for connected providers, alert delivery records, and email preferences.</li>
          <li><strong>Logs.</strong> We keep limited diagnostic logs (for example error traces) to operate and debug the service. Credentials and secrets are never written to these logs.</li>
          <li><strong>Cookies.</strong> The application does not use tracking cookies. See our Cookie Policy for details.</li>
        </ul>
      </LegalSection>

      <LegalSection id="how-we-use" title="2. How We Use Your Information">
        <p>We use the information above to:</p>
        <ul style={{ paddingLeft: 20 }}>
          <li>Operate the service: authenticate you, scan repositories you connect, monitor provider changelogs for breaking changes, and raise alerts.</li>
          <li>Generate auto-fix pull requests in repositories you connect and you have authorized — you remain responsible for reviewing and merging them.</li>
          <li>Send transactional email (alerts, digests, and product updates) through our email provider.</li>
          <li>Process billing if you subscribe to a paid plan.</li>
          <li>Secure the service, investigate errors, and respond to support requests.</li>
        </ul>
        <p>We do not sell your personal information. We do not use your data for advertising.</p>
      </LegalSection>

      <LegalSection id="storage-security" title="3. Storage & Security">
        <ul style={{ paddingLeft: 20 }}>
          <li>Data is stored in a hosted PostgreSQL database (Supabase) with encryption at rest.</li>
          <li>GitHub access tokens and provider API keys are encrypted before storage (Fernet, AES-128-CBC with HMAC); the encryption key exists only in the server environment.</li>
          <li>All traffic uses HTTPS in transit.</li>
          <li>Database credentials (service-role key) exist only on the server and are never shipped to the browser.</li>
          <li>Provider credentials are shown in the UI only as masked metadata (e.g. a short identifier), never as full keys.</li>
        </ul>
      </LegalSection>

      <LegalSection id="retention" title="4. Data Retention">
        <p>
          We retain your account data while your account is active. Deleting your account removes your account,
          repository connections, provider connections, scan results, and alerts. Global provider-incident records
          are not attributable to any individual user and may be retained for service operation. Records may be kept
          for a limited additional period where required for legal, accounting, or abuse-prevention purposes.
        </p>
      </LegalSection>

      <LegalSection id="third-parties" title="5. Third-Party Services">
        <p>We work with the following processors to operate the service:</p>
        <ul style={{ paddingLeft: 20 }}>
          <li><strong>GitHub</strong> — OAuth sign-in and repository access (including opening auto-fix pull requests only in repositories you connect, with your review).</li>
          <li><strong>Supabase</strong> — hosted PostgreSQL database.</li>
          <li><strong>Vercel</strong> — hosting for the web application and API.</li>
          <li><strong>Resend</strong> — transactional email delivery.</li>
          <li><strong>Stripe</strong> — payment processing, only if you subscribe to a paid plan.</li>
        </ul>
      </LegalSection>

      <LegalSection id="analytics-cookies" title="6. Analytics & Cookies">
        <p>
          We do not run third-party visitor analytics and we do not use advertising or tracking cookies.
          Authentication state is kept in your browser&apos;s local/session storage (not cookies). See our{" "}
          <a href="/cookies" style={{ color: "var(--accent-text, #4f46e5)" }}>Cookie Policy</a> for details.
        </p>
      </LegalSection>

      <LegalSection id="your-rights" title="7. Your Rights & Data Deletion">
        <ul style={{ paddingLeft: 20 }}>
          <li><strong>Access & correction.</strong> You can view and update your account data in the application, or request a copy by contacting us.</li>
          <li><strong>Deletion.</strong> You can disconnect repositories and providers at any time, and delete your account (which removes your data as described in section 4).</li>
          <li><strong>Revoke GitHub access.</strong> You can revoke the application&apos;s GitHub access at any time from your GitHub account settings.</li>
        </ul>
        <p>
          If you are in a jurisdiction with data-protection rights (such as the GDPR or CCPA), we honour those rights:
          access, correction, deletion, restriction, portability, and objection. We do not engage in automated
          decision-making that produces legal effects about you. To exercise any right, contact us using the details
          in section 9.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="8. Changes to This Policy">
        <p>
          We may update this policy as the service evolves. Material changes will be announced on this page with an
          updated “Last updated” date, and where practical we will notify you by email.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="9. Contact">
        <p>
          This policy is provided by {LEGAL_ENTITY}
          {LEGAL_ADDRESS ? `, ${LEGAL_ADDRESS}.` : " (registered address available on request)."}
        </p>
        <p>
          Questions or privacy requests:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--accent-text, #4f46e5)" }}>{SUPPORT_EMAIL}</a>
          {" "}or visit our <a href="/contact" style={{ color: "var(--accent-text, #4f46e5)" }}>Contact page</a>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}