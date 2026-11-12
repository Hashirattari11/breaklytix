// Ready-made post text for the "Share on X" button on /scan/[id].
//
// Pure and dependency-free so it can be unit-tested with `node --test` and
// used in both server and client components. X counts every URL as 23
// characters, so the *text* is capped at 250 to leave a safety margin inside
// the 280 limit. Only counts and provider display names go into the post —
// never file paths, snippets, environment-variable names or secret values.

import type { ScanResult } from "./instant-scan";

export const SHARE_TEXT_LIMIT = 250;
export const X_URL_WEIGHT = 23;
export const SHARE_SITE_ORIGIN = "https://breaklytix.site";

/** Shape needed to build a post; keeps tests free of full API fixtures. */
export type ShareTextInput = Pick<ScanResult, "repo" | "summary" | "providers" | "risks">;

export function scanUrl(scanId: string): string {
  return `${SHARE_SITE_ORIGIN}/scan/${encodeURIComponent(scanId)}`;
}

/** X Web Intent — opens the composer with the text and link prefilled. */
export function buildShareIntentUrl(scanId: string, text: string): string {
  const url = scanUrl(scanId);
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

export function buildLinkedInShareUrl(scanId: string): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(scanUrl(scanId))}`;
}

function clampCount(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function providerNames(input: ShareTextInput): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  const push = (raw: unknown) => {
    const name = String(raw ?? "").trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    names.push(name);
  };

  for (const provider of input.providers || []) {
    push(provider?.name || provider?.api_name);
  }
  // Fall back to risk rows only when provider rows are missing entirely.
  if (!names.length) {
    for (const risk of input.risks || []) {
      push(risk?.provider_name || risk?.api_name);
    }
  }
  return names;
}

function providerClause(names: string[], max: number): string {
  if (!names.length || max <= 0) return "";
  const shown = names.slice(0, max).map((name) => (name.length > 32 ? `${name.slice(0, 29)}...` : name));
  const extra = names.length - shown.length;
  return extra > 0 ? ` (${shown.join(", ")}, +${extra} more)` : ` (${shown.join(", ")})`;
}

function compose(input: ShareTextInput, repo: string, names: string[], maxProviders: number): string {
  const integrations = clampCount(input.summary?.integration_count);
  const risks = clampCount(input.summary?.possible_risk_count);

  if (integrations === 0) {
    return `I scanned ${repo} with Breaklytix. Scan your repo free and see which APIs it depends on:`;
  }

  const apiWord = integrations === 1 ? "API integration" : "API integrations";
  if (risks > 0) {
    const riskWord = risks === 1 ? "possible risk" : "possible risks";
    return (
      `I scanned ${repo} with Breaklytix: ${integrations} ${apiWord} found, ` +
      `${risks} ${riskWord}${providerClause(names, maxProviders)}. See the issues here:`
    );
  }
  return (
    `I scanned ${repo} with Breaklytix: ${integrations} ${apiWord} found, ` +
    "no recent provider breaking-change notices. Scan your repo free:"
  );
}

function shorten(value: string, max: number): string {
  if (max <= 0) return "";
  if (value.length <= max) return value;
  if (max <= 3) return value.slice(0, max);
  return `${value.slice(0, max - 3).replace(/[\s/._-]+$/, "")}...`;
}

function hardTruncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3).trimEnd()}...`;
}

/**
 * Build the post text, guaranteed to be <= SHARE_TEXT_LIMIT characters.
 *
 * Strategy, in order: drop the provider list (3 -> 2 -> 1 -> 0), then shorten
 * the repo name, then hard-truncate as a last resort. The scan URL is passed
 * separately to X via the `url` parameter and is never part of this string.
 */
export function buildShareText(input: ShareTextInput): string {
  const repoFull = String(input.repo || "this repo").trim() || "this repo";
  const names = providerNames(input);

  for (const maxProviders of [3, 2, 1, 0]) {
    const text = compose(input, repoFull, names, maxProviders);
    if (text.length <= SHARE_TEXT_LIMIT) return text;
  }

  // The repo name alone is too long. Reserve space for everything else.
  const withEmptyRepo = compose(input, "", names, 0);
  const repoBudget = SHARE_TEXT_LIMIT - withEmptyRepo.length;
  if (repoBudget >= 6) {
    const text = compose(input, shorten(repoFull, repoBudget), names, 0);
    if (text.length <= SHARE_TEXT_LIMIT) return text;
  }

  return hardTruncate(compose(input, shorten(repoFull, 24), names, 0), SHARE_TEXT_LIMIT);
}
