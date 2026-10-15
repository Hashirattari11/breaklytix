/**
 * Pricing FAQ — single source of truth.
 *
 * Lives in a plain shared module (not in the "use client" PricingClient) so
 * both the server-rendered FAQPage JSON-LD and the client-rendered accordion
 * read the same array. A server component cannot call a function exported from
 * a client module, which is why this is not defined inside PricingClient.
 */
export const PRICING_FAQ: { q: string; a: string }[] = [
  {
    q: "What counts as a 'monitored API'?",
    a: "Each unique third-party API (Stripe, Shopify, Twilio, SendGrid, GitHub) detected in your connected repositories counts toward your limit. Multiple repositories using the same API only count once per API.",
  },
  {
    q: "Can I change plans later?",
    a: "Yes, you can upgrade or downgrade at any time from your billing dashboard. Changes take effect immediately, and we'll prorate the difference.",
  },
  {
    q: "What happens after my free trial ends?",
    a: "After 14 days, you'll be prompted to select a paid plan. Your data and monitoring continue uninterrupted if you upgrade. If you don't upgrade, monitoring will pause until you subscribe.",
  },
  {
    q: "Do you offer annual billing discounts?",
    a: "Annual billing is not currently available. Contact us and we'll update you if that changes.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept major credit cards via Stripe. For enterprise billing arrangements, contact us through the contact page.",
  },
];