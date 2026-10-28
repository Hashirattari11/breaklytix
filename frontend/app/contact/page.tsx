import type { Metadata } from "next";
import LegalLayout, { LegalSection, LegalTitle, LEGAL_LINKS } from "@/components/LegalLayout";
import { BreadcrumbJsonLd, ContactPageJsonLd } from "@/components/JsonLd";
import Link from "next/link";
import { LEGAL_ADDRESS, LEGAL_ENTITY, SITE_NAME, SITE_URL, SUPPORT_EMAIL, pageOpenGraph } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact Breaklytix Support and Sales",
  description:
    `Contact ${SITE_NAME} for product support, billing questions, bug reports, security disclosures, or legal and privacy requests. Email the team directly.`,
  alternates: { canonical: SITE_URL + "/contact" },
  robots: { index: true, follow: true },
  openGraph: pageOpenGraph("/contact"),
};

const TOC = [
  { id: "email", label: "1. Email Support" },
  { id: "issues", label: "2. GitHub Issues" },
  { id: "legal", label: "3. Legal & Other Inquiries" },
];

export default function ContactPage() {
  return (
    <LegalLayout>
      <BreadcrumbJsonLd name="Contact & Support" path="/contact" />
      <ContactPageJsonLd />
      <LegalTitle
        title="Contact & Support"
        updated="September 8, 2026"
        intro={`We’re happy to help with product questions, bug reports, billing questions, and security reports.`}
        toc={TOC}
      />

      <LegalSection id="email" title="1. Email Support">
        <p>
          The fastest way to reach us is by email:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--accent-text, #4f46e5)" }}>{SUPPORT_EMAIL}</a>
        </p>
      </LegalSection>

      <LegalSection id="issues" title="2. GitHub Issues">
        <p>
          For bug reports and feature requests, you can also open an issue on our public repository:{" "}
          <a
            href="https://github.com/Hashirattari11/breaklytix/issues"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent-text, #4f46e5)" }}
          >
            github.com/Hashirattari11/breaklytix/issues
          </a>
          . Please do not include API keys, tokens, or other secrets in issues, emails, or screenshots.
        </p>
      </LegalSection>

      <LegalSection id="legal" title="3. Legal & Other Inquiries">
        <p>
          For legal, privacy, or data-deletion requests, contact us at the email above or use any of the
          legal pages below. We are {LEGAL_ENTITY}
          {LEGAL_ADDRESS ? `, ${LEGAL_ADDRESS}.` : " (registered address available on request)."}
        </p>
        <nav aria-label="Legal" style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
          {LEGAL_LINKS.filter((l) => l.href !== "/contact").map((l) => (
            <Link
              key={l.href}
              href={l.href}
              style={{ fontSize: 14, color: "var(--accent-text, #4f46e5)", textDecoration: "none" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </LegalSection>
    </LegalLayout>
  );
}