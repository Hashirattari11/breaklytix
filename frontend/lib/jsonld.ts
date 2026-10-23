/**
 * Serialize structured data for an inline <script type="application/ld+json">.
 *
 * `JSON.stringify` alone is unsafe inside HTML: a string containing
 * `</script>` would terminate the tag and inject markup. Escaping the HTML
 * metacharacters (and the JS line separators) keeps the payload valid JSON
 * while making breakout impossible, even if content later becomes dynamic.
 */
export function jsonLdHtml(data: unknown): string {
  return (JSON.stringify(data) ?? "null")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
