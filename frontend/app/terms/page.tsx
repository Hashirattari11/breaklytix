import type { Metadata } from "next";
import LegalLayout, { LegalSection, LegalTitle } from "@/components/LegalLayout";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { LEGAL_ADDRESS, LEGAL_ENTITY, SITE_NAME, SITE_URL, SUPPORT_EMAIL, pageOpenGraph } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service for Breaklytix Accounts",
  description:
    `The terms that govern your use of ${SITE_NAME}: accounts, acceptable use, repository scanning, auto-fix pull requests, billing, and liability.`,
  alternates: { canonical: SITE_URL + "/terms" },
  robots: { index: true, follow: true },
  openGraph: pageOpenGraph("/terms"),
};

const TOC = [
  { id: "service", label: "1. Service Description" },
  { id: "accounts", label: "2. Accounts & Responsibilities" },
  { id: "acceptable-use", label: "3. Acceptable Use" },
  { id: "api-usage", label: "4. API Usage" },
  { id: "github-access", label: "5. GitHub & Repository Access" },
  { id: "provider-integrations", label: "6. Provider Integrations" },
  { id: "automated-scanning", label: "7. Automated Scanning" },
  { id: "auto-fix", label: "8. Auto-Fix & Pull Requests" },
  { id: "availability", label: "9. Service Availability" },
  { id: "third-parties", label: "10. Third-Party Services" },
  { id: "ip", label: "11. Intellectual Property" },
  { id: "termination", label: "12. Suspension & Termination" },
  { id: "liability", label: "13. Limitation of Liability" },
  { id: "changes", label: "14. Changes to These Terms" },
  { id: "contact", label: "15. Contact" },
];

export default function TermsPage() {
  return (
    <LegalLayout>
      <BreadcrumbJsonLd name="Terms of Service" path="/terms" />
      <LegalTitle
        title="Terms of Service"
        updated="September 8, 2026"
        intro={`These terms ("Terms") govern your access to and use of ${SITE_NAME}. By creating an account or using the service, you agree to these Terms.`}
        toc={TOC}
      />

      <LegalSection id="service" title="1. Service Description">
        <p>
          {SITE_NAME} is a developer tool that (a) scans repositories you connect to detect third-party API usage,
          (b) monitors public provider changelogs for breaking changes, (c) raises alerts about relevant changes,
          and (d) with your authorization, can propose fixes by opening pull requests. Provider-level monitoring
          (usage, quota, rate limits, health) is tied to provider connections you add, separate from repositories.
        </p>
      </LegalSection>

      <LegalSection id="accounts" title="2. Accounts & Responsibilities">
        <ul style={{ paddingLeft: 20 }}>
          <li>You sign in with a GitHub account. You are responsible for the security of your account and for activity under it.</li>
          <li>You must have the legal right to connect any repository you scan with the service.</li>
          <li>You must provide accurate information and keep it current.</li>
          <li>You are responsible for complying with your own organization&apos;s policies when you connect their repositories.</li>
        </ul>
      </LegalSection>

      <LegalSection id="acceptable-use" title="3. Acceptable Use">
        <p>You agree not to misuse the service. See our{" "}
          <a href="/acceptable-use" style={{ color: "var(--accent-text, #4f46e5)" }}>Acceptable Use Policy</a> for the full list of prohibited conduct.</p>
      </LegalSection>

      <LegalSection id="api-usage" title="4. API Usage">
        <p>
          Where we expose an API, you agree not to exceed documented rate limits, not to probe or scan other users&apos;
          data, and not to use the API for purposes other than integrating with the service.
        </p>
      </LegalSection>

      <LegalSection id="github-access" title="5. GitHub & Repository Access">
        <p>
          The service accesses GitHub only through the permissions you grant when you connect a repository. We read
          repository metadata and source files needed to detect API usage. For auto-fix, we may create branches and
          open pull requests in repositories you connect — only after you authorize the repository connection. We do
          not delete repositories, branches, or pull requests.
        </p>
      </LegalSection>

      <LegalSection id="provider-integrations" title="6. Provider Integrations">
        <p>
          Provider-level monitoring is per-connection: you add a provider connection and provide an API key for the
          provider you want to monitor. Not every metric is available from every provider; where a provider does not
          expose a metric we show it as unavailable rather than fabricating data.
        </p>
      </LegalSection>

      <LegalSection id="automated-scanning" title="7. Automated Scanning">
        <p>
          When you connect a repository, the service scans its files to detect third-party API usage and dependency
          versions. Scanning is subject to configured limits (for example a maximum number of files per repository).
          Results are advisory only.
        </p>
      </LegalSection>

      <LegalSection id="auto-fix" title="8. Auto-Fix & Pull Requests">
        <ul style={{ paddingLeft: 20 }}>
          <li>When auto-fix is enabled for a connected repository, the service may open pull requests containing suggested fixes for detected issues.</li>
          <li>Auto-fix pull requests are suggestions, not guarantees. They are not merged automatically.</li>
          <li><strong>You are solely responsible for reviewing, testing, and deciding whether to merge any auto-fix pull request.</strong> We are not liable for changes made by merging them.</li>
        </ul>
      </LegalSection>

      <LegalSection id="availability" title="9. Service Availability">
        <p>
          We aim to keep the service reliable, but we do not guarantee uninterrupted or error-free operation.
          The service may be temporarily unavailable for maintenance or due to factors outside our control (including
          outages of GitHub, Supabase, Vercel, or other providers). Monitoring is based on public changelogs and
          status sources; we cannot guarantee that every breaking change is detected or that alerts are delivered.
        </p>
      </LegalSection>

      <LegalSection id="third-parties" title="10. Third-Party Services">
        <p>
          The service depends on third-party services (GitHub, Supabase, Vercel, Resend, and — if you subscribe —
          Stripe). Your use of those services is also governed by their own terms and policies. We are not responsible
          for their availability or conduct.
        </p>
      </LegalSection>

      <LegalSection id="ip" title="11. Intellectual Property">
        <p>
          You retain all rights to your code and repository data. We do not claim ownership of your content.
          The service itself (software, documentation, branding) is owned by {LEGAL_ENTITY}.
          Using the service does not transfer any ownership of our intellectual property to you.
        </p>
      </LegalSection>

      <LegalSection id="termination" title="12. Suspension & Termination">
        <p>
          You may stop using the service and delete your account at any time. We may suspend or terminate access if
          you breach these Terms or the Acceptable Use Policy, if we suspect abuse or fraud, or if required by law.
          Where practical we will notify you in advance. On termination, your data is handled as described in the
          Privacy Policy.
        </p>
      </LegalSection>

      <LegalSection id="liability" title="13. Limitation of Liability">
        <p>
          The service is provided “as is” and “as available”, without warranties of any kind, whether express or
          implied, including fitness for a particular purpose. To the maximum extent permitted by law, {LEGAL_ENTITY}{" "}
          is not liable for indirect, incidental, special, or consequential damages, or for any loss of data, revenue,
          or profits, arising from your use of the service, including missed or incorrect alerts and the consequences
          of merging auto-fix pull requests. Our total liability for any claim is limited to the amount you paid for
          the service in the twelve months before the claim, or $100 if you paid nothing.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="14. Changes to These Terms">
        <p>
          We may update these Terms as the service evolves. Continued use of the service after changes are posted
          constitutes acceptance. Where required, material changes will be announced on this page and by email.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="15. Contact">
        <p>
          {LEGAL_ENTITY}
          {LEGAL_ADDRESS ? `, ${LEGAL_ADDRESS}.` : " (registered address available on request)."}
        </p>
        <p>
          Questions about these Terms:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--accent-text, #4f46e5)" }}>{SUPPORT_EMAIL}</a>
          {" "}or visit our <a href="/contact" style={{ color: "var(--accent-text, #4f46e5)" }}>Contact page</a>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}