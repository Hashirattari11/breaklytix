import type { Metadata } from "next";
import LegalLayout, { LegalSection, LegalTitle } from "@/components/LegalLayout";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { SITE_NAME, SITE_URL, SUPPORT_EMAIL, pageOpenGraph } from "@/lib/site";

export const metadata: Metadata = {
  title: "Cookie Policy & Browser Storage",
  description:
    `How ${SITE_NAME} uses cookies and browser storage: local and session storage for authentication, no tracking or advertising cookies, and how to clear them.`,
  alternates: { canonical: SITE_URL + "/cookies" },
  robots: { index: true, follow: true },
  openGraph: pageOpenGraph("/cookies"),
};

const TOC = [
  { id: "summary", label: "1. Summary" },
  { id: "storage", label: "2. Browser Storage We Use" },
  { id: "no-tracking", label: "3. No Tracking or Advertising Cookies" },
  { id: "platform-cookies", label: "4. Hosting Platform Cookies" },
  { id: "consent", label: "5. Do We Need a Consent Banner?" },
  { id: "control", label: "6. Controlling Storage" },
  { id: "changes", label: "7. Changes to This Policy" },
  { id: "contact", label: "8. Contact" },
];

export default function CookiesPage() {
  return (
    <LegalLayout>
      <BreadcrumbJsonLd name="Cookie Policy" path="/cookies" />
      <LegalTitle
        title="Cookie Policy"
        updated="September 8, 2026"
        intro={`This policy explains what browser storage ${SITE_NAME} uses and why. It is written to match how the application actually behaves.`}
        toc={TOC}
      />

      <LegalSection id="summary" title="1. Summary">
        <p>
          {SITE_NAME} does not use tracking, advertising, or analytics cookies. We use browser storage only to keep
          you signed in. As a result, we do not show a cookie-consent banner — there are no non-essential cookies to
          consent to.
        </p>
      </LegalSection>

      <LegalSection id="storage" title="2. Browser Storage We Use">
        <ul style={{ paddingLeft: 20 }}>
          <li><strong>Local storage</strong> — we store your session token and basic profile (email, GitHub username) in your browser&apos;s local storage after you sign in, so you stay signed in between visits. This is essential to the application.</li>
          <li><strong>Session storage</strong> — a random one-time value is kept in session storage during GitHub sign-in to protect the OAuth flow from cross-site request forgery. It is cleared when the tab closes.</li>
        </ul>
        <p>Neither mechanism is a cookie, and neither is used for tracking.</p>
      </LegalSection>

      <LegalSection id="no-tracking" title="3. No Tracking or Advertising Cookies">
        <p>
          We do not use third-party analytics, advertising, or social-tracking cookies. We do not build profiles of
          your browsing across websites.
        </p>
      </LegalSection>

      <LegalSection id="platform-cookies" title="4. Hosting Platform Cookies">
        <p>
          The service is hosted on Vercel&apos;s platform, which may set a small cookie for its own privacy-consent
          and platform functions (for example a consent-state cookie on the vercel.com domain). This is set by the
          hosting platform, not by {SITE_NAME}, and is outside our control.
        </p>
      </LegalSection>

      <LegalSection id="consent" title="5. Do We Need a Consent Banner?">
        <p>
          No. Because we do not place non-essential cookies or tracking scripts, there is nothing that requires an
          opt-in banner. If that ever changes, we will update this policy and show an appropriate consent prompt.
        </p>
      </LegalSection>

      <LegalSection id="control" title="6. Controlling Storage">
        <p>
          You can clear local and session storage at any time using your browser&apos;s settings (this will sign you
          out). Most browsers also let you block storage per site. Blocking essential storage will prevent the
          application from keeping you signed in.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="7. Changes to This Policy">
        <p>We will update this policy if the storage mechanisms we use change. The “Last updated” date above reflects the current version.</p>
      </LegalSection>

      <LegalSection id="contact" title="8. Contact">
        <p>
          Questions about this policy:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--accent-text, #4f46e5)" }}>{SUPPORT_EMAIL}</a>
          {" "}or visit our <a href="/contact" style={{ color: "var(--accent-text, #4f46e5)" }}>Contact page</a>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}