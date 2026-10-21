import type { Metadata } from "next";
import LegalLayout, { LegalSection, LegalTitle } from "@/components/LegalLayout";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { SITE_NAME, SITE_URL, SUPPORT_EMAIL, pageOpenGraph } from "@/lib/site";

export const metadata: Metadata = {
  title: "Acceptable Use Policy",
  description:
    `The conduct ${SITE_NAME} prohibits: abuse of the service, API misuse, unauthorized access, and other misuse of the platform.`,
  alternates: { canonical: SITE_URL + "/acceptable-use" },
  robots: { index: true, follow: true },
  openGraph: pageOpenGraph("/acceptable-use"),
};

const TOC = [
  { id: "purpose", label: "1. Purpose" },
  { id: "prohibited", label: "2. Prohibited Conduct" },
  { id: "repos", label: "3. Repositories & Content" },
  { id: "automation", label: "4. Automation & Auto-Fix" },
  { id: "integrity", label: "5. Service Integrity" },
  { id: "violations", label: "6. Reporting Violations" },
  { id: "actions", label: "7. Our Actions" },
];

export default function AcceptableUsePage() {
  return (
    <LegalLayout>
      <BreadcrumbJsonLd name="Acceptable Use Policy" path="/acceptable-use" />
      <LegalTitle
        title="Acceptable Use Policy"
        updated="September 8, 2026"
        intro={`This policy (together with the Terms of Service) describes what is and is not allowed on ${SITE_NAME}.`}
        toc={TOC}
      />

      <LegalSection id="purpose" title="1. Purpose">
        <p>
          {SITE_NAME} is a developer tool for detecting API usage, monitoring breaking changes, and raising alerts.
          Use it for what it is built for, and don&apos;t use it to harm others, the service, or the providers it monitors.
        </p>
      </LegalSection>

      <LegalSection id="prohibited" title="2. Prohibited Conduct">
        <p>You must not:</p>
        <ul style={{ paddingLeft: 20 }}>
          <li>Access or attempt to access another user&apos;s account, repositories, provider connections, alerts, or data.</li>
          <li>Use the service for any unlawful purpose or in violation of applicable law.</li>
          <li>Exceed documented API rate limits or otherwise place unreasonable load on the service or its dependencies (for example GitHub or provider APIs).</li>
          <li>Scrape, probe, or harvest the service, its APIs, or its public pages at scale or in ways that degrade availability.</li>
          <li>Attempt to bypass authentication, authorization, rate limiting, or any security control.</li>
          <li>Reverse engineer, decompile, or extract the source code of the service (except as permitted by law).</li>
          <li>Resell, sublicense, or provide the service to third parties as a commercial service without written permission.</li>
          <li>Impersonate others or misrepresent your affiliation with a repository or organization.</li>
          <li>Use the service to transmit malware, phishing content, or other harmful material.</li>
        </ul>
      </LegalSection>

      <LegalSection id="repos" title="3. Repositories & Content">
        <ul style={{ paddingLeft: 20 }}>
          <li>Connect only repositories you own or are authorized to connect.</li>
          <li>Do not use the service to store or exfiltrate content you have no right to access.</li>
          <li>Do not use the service to attack, spam, or otherwise harm the owners of repositories or the providers whose APIs are monitored.</li>
        </ul>
      </LegalSection>

      <LegalSection id="automation" title="4. Automation & Auto-Fix">
        <ul style={{ paddingLeft: 20 }}>
          <li>Auto-fix pull requests are generated per your configuration and are never merged automatically. Do not enable auto-fix on repositories where you are not authorized to open pull requests.</li>
          <li>Do not deliberately generate excessive scans, alerts, or pull requests to disrupt a repository, an organization, or the service.</li>
        </ul>
      </LegalSection>

      <LegalSection id="integrity" title="5. Service Integrity">
        <ul style={{ paddingLeft: 20 }}>
          <li>Do not interfere with the operation of the service, its hosting infrastructure, or the third-party services it relies on.</li>
          <li>Do not introduce malicious code or otherwise attempt to compromise the service.</li>
          <li>Do not circumvent geographic, licensing, or other service restrictions.</li>
        </ul>
      </LegalSection>

      <LegalSection id="violations" title="6. Reporting Violations">
        <p>
          If you believe someone is misusing the service, tell us:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "#635bff" }}>{SUPPORT_EMAIL}</a>
          {" "}or our <a href="/contact" style={{ color: "#635bff" }}>Contact page</a>.
        </p>
      </LegalSection>

      <LegalSection id="actions" title="7. Our Actions">
        <p>
          We may suspend or terminate accounts that violate this policy, as described in the Terms of Service.
          We also cooperate with law enforcement where required by law.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}