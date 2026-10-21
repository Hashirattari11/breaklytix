import type { Metadata } from "next";
import LegalLayout, { LegalSection, LegalTitle, LEGAL_LINKS } from "@/components/LegalLayout";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import Link from "next/link";
import { LEGAL_ADDRESS, LEGAL_ENTITY, SITE_NAME, SITE_URL, SUPPORT_EMAIL, pageOpenGraph } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact Breaklytix Support and Sales",
  description:
    `Get help with ${SITE_NAME}: support email, GitHub issues, sales and legal contacts, and how to configure your own support contact.`,
  alternates: { canonical: SITE_URL + "/contact" },
  robots: { index: true, follow: true },
  openGraph: pageOpenGraph("/contact"),
};

const TOC = [
  { id: "email", label: "1. Email Support" },
  { id: "issues", label: "2. GitHub Issues" },
  { id: "configure", label: "3. How This Page Is Configured" },
  { id: "legal", label: "4. Legal & Other Inquiries" },
];

export default function ContactPage() {
  return (
    <LegalLayout>
      <BreadcrumbJsonLd name="Contact & Support" path="/contact" />
      <LegalTitle
        title="Contact & Support"
        updated="September 8, 2026"
        intro={`We’re happy to help with product questions, bug reports, billing questions, and security reports.`}
        toc={TOC}
      />

      <LegalSection id="email" title="1. Email Support">
        <p>
          The fastest way to reach us is by email:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "#635bff" }}>{SUPPORT_EMAIL}</a>
        </p>
      </LegalSection>

      <LegalSection id="issues" title="2. GitHub Issues">
        <p>
          For bug reports and feature requests, you can also open an issue on our public repository:{" "}
          <a
            href="https://github.com/Hashirattari11/autofix/issues"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#635bff" }}
          >
            github.com/Hashirattari11/autofix/issues
          </a>
          . Please do not include API keys, tokens, or other secrets in issues, emails, or screenshots.
        </p>
      </LegalSection>

      <LegalSection id="configure" title="3. How This Page Is Configured">
        <p>
          The support email above is configured with the{" "}
          <code style={{ background: "#f3f4f6", padding: "2px 6px", borderRadius: 6, fontSize: 13 }}>NEXT_PUBLIC_SUPPORT_EMAIL</code>{" "}
          environment variable. Until it is set, the page falls back to the project&apos;s current support address.
          Operators can update it in the hosting environment without code changes.
        </p>
      </LegalSection>

      <LegalSection id="legal" title="4. Legal & Other Inquiries">
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
              style={{ fontSize: 14, color: "#635bff", textDecoration: "none" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </LegalSection>
    </LegalLayout>
  );
}