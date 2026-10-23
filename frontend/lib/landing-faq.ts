/**
 * Landing-page FAQ — single source of truth.
 *
 * Lives in a plain shared module (not in the "use client" LandingClient) so
 * both the server-rendered FAQPage JSON-LD in app/page.tsx and the
 * client-rendered accordion read the same array. A server component cannot
 * call a function exported from a client module, which is why this is not
 * defined inside LandingClient.
 *
 * Kept deliberately separate from lib/pricing-faq.ts: pricing answers billing
 * mechanics (limits, plans, proration) for buyers mid-evaluation, whereas these
 * answer first-visitor product questions (what it is, how detection works, is
 * my code changed). Same rationale for the shared-module layout applies to both.
 */
export const LANDING_FAQ: { q: string; a: string }[] = [
  {
    q: "What is Breaklytix?",
    a: "Breaklytix monitors third-party API providers for breaking changes and maps each change back to the exact files and functions in your GitHub repositories that use them — so you find out before an upgrade breaks production, not after.",
  },
  {
    q: "How does Breaklytix detect which APIs my code uses?",
    a: "You connect your GitHub repositories, and Breaklytix scans them to build a live map of the third-party APIs they depend on — the provider, endpoint, function, file, and even the code block that uses it.",
  },
  {
    q: "What happens when a provider ships a breaking change?",
    a: "You get an alert that names the affected APIs and lists every impacted repository, file, and function with the exact lines to review — plus a confidence score so you can tell a real break from a false positive.",
  },
  {
    q: "Does Breaklytix change my code automatically?",
    a: "No. High-confidence changes can generate an auto-fix pull request, but it only opens after you approve it in the review UI. Nothing is merged into your default branch without your team's review.",
  },
  {
    q: "Which providers does Breaklytix monitor?",
    a: "Breaklytix supports 44+ providers across payments, commerce, communications, email, cloud, and DevOps — including Stripe, Shopify, Twilio, SendGrid, and GitHub. You can see the full list on the providers page.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes. Every plan starts with a 10-day free trial and no credit card is required, so you can see detected APIs and sample alerts against your own repositories before you pay.",
  },
];
