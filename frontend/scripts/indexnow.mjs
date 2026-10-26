// Submit every public sitemap URL to IndexNow (Bing, Yandex, Seznam, Naver).
// The key is public by design: it is served at /<key>.txt and proves domain
// ownership. Run after a production deploy:
//
//   BASE_URL=https://breaklytix.site npm run seo:indexnow
//
// Google does not participate in IndexNow; it discovers pages through the
// sitemap and normal crawling.

const BASE_URL = (process.env.BASE_URL || "https://breaklytix.site").replace(/\/+$/, "");
const KEY = "ace194609864eb0f3f23c516c4ad9f3c";
const KEY_LOCATION = `${BASE_URL}/${KEY}.txt`;
const ENDPOINT = "https://api.indexnow.org/indexnow";

const sitemapResponse = await fetch(`${BASE_URL}/sitemap.xml`, { headers: { accept: "application/xml" } });
if (!sitemapResponse.ok) {
  console.error(`Failed to fetch sitemap: ${sitemapResponse.status} ${sitemapResponse.statusText}`);
  process.exit(1);
}
const sitemap = await sitemapResponse.text();
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
if (!urls.length) {
  console.error("Sitemap contained no URLs");
  process.exit(1);
}

const payload = {
  host: new URL(BASE_URL).host,
  key: KEY,
  keyLocation: KEY_LOCATION,
  urlList: urls.slice(0, 10000),
};

const response = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify(payload),
});

console.log(`IndexNow: ${response.status} ${response.statusText}`);
console.log(`Submitted ${payload.urlList.length} URLs for ${payload.host}`);
if (!response.ok && response.status !== 202) {
  const body = await response.text();
  console.error(body);
  process.exit(1);
}
