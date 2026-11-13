// Unit tests for the shared "Share on X" post builder.
//
// Run with:  npm run test:share
// (Node >= 22 runs TypeScript type-stripping; the helper module is pure and
//  dependency-free so it can be exercised without a bundler or test framework.)
import test from "node:test";
import assert from "node:assert";
import { buildShareIntentUrl, buildLinkedInShareUrl, buildShareText, scanUrl, SHARE_TEXT_LIMIT, X_URL_WEIGHT } from "../lib/share-text.ts";

function makeResult(overrides) {
  return {
    repo: "acme/api",
    repo_url: "https://github.com/acme/api",
    scanned_at: "2026-11-12T00:00:00Z",
    duration_ms: 1200,
    partial: false,
    files_considered: 4,
    files_scanned: 2,
    providers: [],
    risks: [],
    summary: { provider_count: 0, integration_count: 0, possible_risk_count: 0 },
    no_risk_message: null,
    ...overrides,
  };
}

test("zero integrations -> friendly discovery prompt", () => {
  const text = buildShareText(makeResult({ repo: "acme/api", summary: { provider_count: 0, integration_count: 0, possible_risk_count: 0 } }));
  assert.ok(text.length <= SHARE_TEXT_LIMIT);
  assert.ok(text.includes("I scanned acme/api with Breaklytix"));
  assert.ok(text.includes("Scan your repo free"));
});

test("no risks -> breaking-change-notice wording", () => {
  const text = buildShareText(
    makeResult({
      repo: "acme/api",
      summary: { provider_count: 1, integration_count: 16, possible_risk_count: 0 },
    }),
  );
  assert.ok(text.length <= SHARE_TEXT_LIMIT);
  assert.ok(text.includes("16 API integrations, health score 100/100, no recent provider notices"));
  assert.ok(!text.includes("will break"));
});

test("risks found -> possible-risk wording with top providers", () => {
  const text = buildShareText(
    makeResult({
      repo: "acme/api",
      summary: { provider_count: 2, integration_count: 3, possible_risk_count: 2 },
      providers: [
        { api_name: "stripe", name: "Stripe", category: "payments", status: "monitored", confidence: "high", evidence_count: 2, file_count: 2, files: [] },
        { api_name: "openai", name: "OpenAI", category: "ai", status: "monitored", confidence: "high", evidence_count: 1, file_count: 1, files: [] },
      ],
      risks: [],
    }),
  );
  assert.ok(text.length <= SHARE_TEXT_LIMIT);
  assert.ok(text.includes("3 API integrations, health score 100/100, 2 possible issues"));
  assert.ok(text.includes("(Stripe, OpenAI)"));
  assert.ok(!text.includes("will break"));
});

test("more than three providers are truncated with +N more", () => {
  const names = ["Stripe", "OpenAI", "Resend", "PostHog", "Slack"].map((name, i) => ({
    api_name: `api-${i}`,
    name,
    category: "x",
    status: "monitored",
    confidence: "high",
    evidence_count: 1,
    file_count: 1,
    files: [],
  }));
  const text = buildShareText(
    makeResult({
      repo: "acme/api",
      summary: { provider_count: 5, integration_count: 5, possible_risk_count: 1 },
      providers: names,
      risks: [],
    }),
  );
  assert.ok(text.includes("(Stripe, OpenAI, Resend, +2 more)"));
  assert.ok(text.length <= SHARE_TEXT_LIMIT);
});

test("long repo names are shortened so the text stays within budget", () => {
  const longRepo = "a-very-long-owner-username-here-with-many-characters-and_more/another-extremely-long-repo-name-with_many_words";
  const text = buildShareText(
    makeResult({
      repo: longRepo,
      summary: { provider_count: 1, integration_count: 2, possible_risk_count: 1 },
      providers: [{ api_name: "openai", name: "OpenAI", category: "ai", status: "monitored", confidence: "high", evidence_count: 1, file_count: 1, files: [] }],
      risks: [],
    }),
  );
  assert.ok(text.length <= SHARE_TEXT_LIMIT, `text was ${text.length}`);
  assert.ok(!text.includes("...") || text.length <= SHARE_TEXT_LIMIT);
});

test("share text never contains secrets, file paths or file contents", () => {
  const text = buildShareText(
    makeResult({
      repo: "acme/awesome-repo",
      summary: { provider_count: 1, integration_count: 2, possible_risk_count: 1 },
      providers: [{ api_name: "stripe", name: "Stripe", category: "payments", status: "monitored", confidence: "high", evidence_count: 2, file_count: 2, files: [] }],
      risks: [],
    }),
  );
  assert.ok(!text.includes("sk_live_"));
  assert.ok(!text.includes("src/"));
  assert.ok(!text.includes(".ts"));
  assert.ok(!text.includes("STRIPE_SECRET"));
});

test("share text always stays within the X character budget", () => {
  const cases = [
    makeResult({ repo: "a/b", summary: { provider_count: 0, integration_count: 0, possible_risk_count: 0 } }),
    makeResult({ repo: "a/b", summary: { provider_count: 3, integration_count: 40, possible_risk_count: 6 } }),
    makeResult({
      repo: "this-repo-has-a-very-long-name/" + "x".repeat(60),
      summary: { provider_count: 9, integration_count: 120, possible_risk_count: 15 },
      providers: Array.from({ length: 9 }, (_, i) => ({ api_name: `api-${i}`, name: `Provider ${i}`, category: "c", status: "monitored", confidence: "high", evidence_count: 1, file_count: 1, files: [] })),
    }),
  ];
  for (const input of cases) {
    const text = buildShareText(input);
    assert.ok(text.length <= SHARE_TEXT_LIMIT, `expected <= ${SHARE_TEXT_LIMIT}, got ${text.length}: "${text}"`);
  }
});

test("intent url is well-formed and encodes text + scan url", () => {
  const url = new URL(buildShareIntentUrl("scan-1", "hello world"));
  assert.equal(url.hostname, "twitter.com");
  assert.equal(url.pathname, "/intent/tweet");
  assert.equal(url.searchParams.get("text"), "hello world");
  assert.equal(url.searchParams.get("url"), "https://breaklytix.site/scan/scan-1");
});

test("linkedIn share url uses the same scan link", () => {
  const url = new URL(buildLinkedInShareUrl("scan-1"));
  assert.equal(url.hostname, "www.linkedin.com");
  assert.ok(url.pathname.includes("/sharing/share-offsite/"));
  assert.ok(url.searchParams.get("url") === "https://breaklytix.site/scan/scan-1");
});

test("scan url is canonical", () => {
  assert.equal(scanUrl("abc"), "https://breaklytix.site/scan/abc");
});
