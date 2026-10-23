#!/usr/bin/env node
/**
 * SEO + structured-data validator for a running production build.
 *
 *   BASE_URL=http://127.0.0.1:3000 npm run seo:validate
 *
 * Checks the rendered HTML (not the source), so it covers metadata merging,
 * JSON-LD serialisation, canonical/OG output, sitemap/robots and internal
 * links exactly as a crawler sees them. Dependency-free: Node 18+ only.
 */
const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const SITE = (process.env.SITE_URL || "https://breaklytix.site").replace(/\/$/, "");

const failures = [];
const warnings = [];
const fail = (message) => failures.push(message);
const warn = (message) => warnings.push(message);

function attrs(tag) {
  const out = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) {
    out[match[1].toLowerCase()] = match[2];
  }
  return out;
}

function metas(html) {
  const out = {};
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(match[0]);
    const key = a.name || a.property;
    if (key) out[key.toLowerCase()] = a.content || "";
  }
  return out;
}

function titleOf(html) {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, " ").trim() : "";
}

function canonicalOf(html) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(match[0]);
    if ((a.rel || "").toLowerCase() === "canonical") return a.href;
  }
  return null;
}

function jsonLdBlocks(html) {
  return [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1].trim());
}

function walkJsonLd(value, visit) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkJsonLd(item, visit));
    return;
  }
  if (value && typeof value === "object") {
    visit(value);
    Object.values(value).forEach((item) => walkJsonLd(item, visit));
  }
}

async function get(path, headers = {}) {
  const res = await fetch(BASE + path, { headers, redirect: "manual" });
  return {
    status: res.status,
    text: await res.text(),
    location: res.headers.get("location"),
  };
}

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------
const robots = await get("/robots.txt");
if (robots.status !== 200) {
  fail(`robots.txt returned HTTP ${robots.status}`);
} else {
  if (!robots.text.includes(`Sitemap: ${SITE}/sitemap.xml`)) {
    fail("robots.txt is missing the sitemap directive");
  }
  for (const path of ["/dashboard", "/admin", "/auth", "/legal-acceptance"]) {
    if (!robots.text.includes(path)) fail(`robots.txt does not disallow ${path}`);
  }
}

// ---------------------------------------------------------------------------
// sitemap.xml
// ---------------------------------------------------------------------------
const sitemap = await get("/sitemap.xml");
const locs = sitemap.status === 200
  ? [...sitemap.text.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1])
  : [];
if (sitemap.status !== 200) fail(`sitemap.xml returned HTTP ${sitemap.status}`);
if (!locs.length) fail("sitemap.xml contains no <loc> entries");

const privatePrefixes = ["/admin", "/dashboard", "/login", "/auth", "/api"];
for (const loc of locs) {
  let path;
  try {
    path = new URL(loc).pathname || "/";
  } catch {
    fail(`sitemap.xml has an invalid <loc>: ${loc}`);
    continue;
  }
  if (privatePrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    fail(`sitemap.xml includes private route ${loc}`);
  }
}

// ---------------------------------------------------------------------------
// Every sitemap URL
// ---------------------------------------------------------------------------
const titles = new Map();
const descriptions = new Map();
const internalLinks = new Set();
let checkedPages = 0;

for (const loc of locs) {
  let path;
  try {
    path = new URL(loc).pathname || "/";
  } catch {
    continue;
  }
  const res = await get(path);
  if (res.status !== 200) {
    fail(`${path} returned HTTP ${res.status}`);
    continue;
  }
  checkedPages += 1;
  const html = res.text;
  const title = titleOf(html);
  const description = metas(html).description || "";
  const canonical = canonicalOf(html);
  const meta = metas(html);
  // Next normalises the root canonical to the origin without a trailing slash.
  const expected = path === "/" ? SITE : SITE + path;

  if (!title) fail(`${path}: missing <title>`);
  else titles.set(title, [...(titles.get(title) || []), path]);
  if (!description) fail(`${path}: missing meta description`);
  else descriptions.set(description, [...(descriptions.get(description) || []), path]);

  if (canonical !== expected) fail(`${path}: canonical ${JSON.stringify(canonical)} != ${JSON.stringify(expected)}`);
  if ((meta.robots || "").toLowerCase().includes("noindex")) fail(`${path}: public page is noindex`);
  for (const property of ["og:title", "og:description", "og:url", "og:type"]) {
    if (!meta[property]) fail(`${path}: missing ${property}`);
  }
  if (meta["og:url"] && meta["og:url"] !== expected) {
    fail(`${path}: og:url ${JSON.stringify(meta["og:url"])} != ${JSON.stringify(expected)}`);
  }

  const h1Count = (html.match(/<h1\b/gi) || []).length;
  if (h1Count !== 1) warn(`${path}: ${h1Count} <h1> elements`);

  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt\s*=/.test(tag[0])) fail(`${path}: <img> without alt`);
  }

  if (html.includes("hashirattari73@gmail.com")) {
    fail(`${path}: old Gmail support address is still rendered`);
  }

  for (const raw of jsonLdBlocks(html)) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      fail(`${path}: invalid JSON-LD (${error.message})`);
      continue;
    }
    if (!data || typeof data !== "object") {
      fail(`${path}: JSON-LD is not an object`);
      continue;
    }
    if (!("@context" in data)) {
      fail(`${path}: JSON-LD missing @context`);
    }
    walkJsonLd(data, (node) => {
      const type = node["@type"];
      if (!type) return;
      if (typeof type !== "string") fail(`${path}: JSON-LD @type is not a string`);
      for (const [key, value] of Object.entries(node)) {
        if (value === null) fail(`${path}: JSON-LD ${type}.${key} is null`);
        if (typeof value === "string" && ["undefined", "null", "[object Object]"].includes(value.trim())) {
          fail(`${path}: JSON-LD ${type}.${key} is ${JSON.stringify(value)}`);
        }
      }
      if (type === "Organization" && node.name) {
        if (!node.url) fail(`${path}: Organization missing url`);
        if (node.email && node.email !== "support@breaklytix.site") {
          fail(`${path}: Organization email is ${JSON.stringify(node.email)}`);
        }
      }
      if (type === "WebSite" && !node.url) fail(`${path}: WebSite missing url`);
      if (type === "BreadcrumbList") {
        const items = node.itemListElement;
        if (!Array.isArray(items) || items.length === 0) {
          fail(`${path}: BreadcrumbList has no itemListElement`);
        } else {
          for (const item of items) {
            if (!item.name || !item.item) fail(`${path}: BreadcrumbList item missing name/item`);
          }
        }
      }
      if (type === "FAQPage" && (!Array.isArray(node.mainEntity) || !node.mainEntity.length)) {
        fail(`${path}: FAQPage has no mainEntity`);
      }
    });
  }

  for (const match of html.matchAll(/<a\b[^>]*href="([^"]+)"/gi)) {
    const href = match[1].trim();
    if (!href.startsWith("/") || href.startsWith("//")) continue;
    const clean = href.split("#")[0].split("?")[0];
    if (clean && !clean.startsWith("/_next")) internalLinks.add(clean);
  }
}

for (const [title, paths] of titles) {
  if (paths.length > 1) fail(`duplicate title used ${paths.length}x (${paths.join(", ")}): ${JSON.stringify(title)}`);
}
for (const [description, paths] of descriptions) {
  if (paths.length > 1) {
    fail(`duplicate description used ${paths.length}x (${paths.join(", ")}): ${JSON.stringify(description)}`);
  }
}

// ---------------------------------------------------------------------------
// Private pages must be noindex (public ones, no auth cookie required)
// ---------------------------------------------------------------------------
for (const path of ["/login", "/dashboard", "/auth/callback", "/legal-acceptance"]) {
  const res = await get(path);
  if (res.status !== 200) {
    fail(`private page ${path} returned HTTP ${res.status}`);
    continue;
  }
  const robotsMeta = metas(res.text).robots || "";
  if (!robotsMeta.toLowerCase().includes("noindex")) {
    fail(`private page ${path} is not noindex (robots=${JSON.stringify(robotsMeta)})`);
  }
}

// ---------------------------------------------------------------------------
// Internal links
// ---------------------------------------------------------------------------
for (const path of internalLinks) {
  const res = await get(path);
  if (res.status >= 400) fail(`broken internal link ${path} -> HTTP ${res.status}`);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log(`SEO validation against ${BASE}`);
console.log(`sitemap URLs: ${locs.length} (checked ${checkedPages})`);
console.log(`internal links: ${internalLinks.size}`);
console.log(`FAILURES: ${failures.length}`);
for (const failure of failures) console.log(`  FAIL: ${failure}`);
console.log(`WARNINGS: ${warnings.length}`);
for (const warning of warnings) console.log(`  WARN: ${warning}`);

process.exit(failures.length ? 1 : 0);
