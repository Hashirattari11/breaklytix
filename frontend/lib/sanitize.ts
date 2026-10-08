/**
 * Convert provider changelog HTML into safe, readable plain text.
 *
 * Provider changelog feeds (Shopify, Stripe, …) contain rich HTML
 * (<p>, <code>, <ul>, …). We NEVER render that HTML: it is untrusted
 * input and rendering it (even sanitized) risks XSS. Instead we walk
 * the parsed DOM (DOMParser does not execute anything) and produce
 * plain TEXT that we render with React's default escaping:
 *
 *   - <p>/<div>/<br>/<li>  → line/paragraph breaks
 *   - <code>/<pre>         → `backticked` inline code
 *   - <a>                  → text (href) so links stay visible
 *   - <script>/<style>     → dropped entirely
 *
 * The result is plain text — no markup survives, so it can never
 * inject HTML into the page.
 */
export function htmlToReadableText(html: string): string {
  if (!html || typeof document === "undefined") {
    // SSR or empty: strip tags with a regex fallback (text-only output).
    return (html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, " ")
      .replace(/\s+\n/g, "\n")
      .trim();
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  // Defense in depth: remove dangerous nodes before walking.
  doc.querySelectorAll("script, style, iframe, object, embed, link, meta").forEach((n) => n.remove());

  const parts: string[] = [];
  const push = (s: string) => {
    const t = s.replace(/[ \t]+/g, " ").trim();
    if (t) parts.push(t);
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      push(node.textContent ?? "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === "br") {
      push("\n");
      return;
    }
    if (tag === "code" || tag === "pre") {
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text) push(`\`${text}\``);
      return;
    }
    if (tag === "a") {
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      const href = el.getAttribute("href") ?? "";
      if (text && href && href !== text && !href.startsWith("#")) push(`${text} (${href})`);
      else push(text);
      return;
    }
    if (tag === "li") {
      el.childNodes.forEach(walk);
      push("\n• ");
      return;
    }
    // Paragraph-level containers: recurse, then close with a blank line.
    const block = ["p", "div", "section", "article", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "table", "tr"].includes(tag);
    el.childNodes.forEach(walk);
    if (block) push("\n\n");
  };

  doc.body.childNodes.forEach(walk);

  return parts
    .join(" ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}
