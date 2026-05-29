/**
 * Cullinan Metals Ticker Proxy — Cloudflare Worker
 *
 * Proxies Yahoo Finance chart data for CSE:CMT (Yahoo symbol: CMT.CN)
 * and returns it with CORS headers so a Webflow embed can fetch it
 * directly from the browser.
 *
 * Locked down to the CMT.CN symbol + a fixed set of ranges/intervals
 * so the worker can't be abused as a generic open proxy.
 *
 * Cached at the Cloudflare edge for 60s — unlimited concurrent viewers
 * cost effectively one upstream request per minute per region.
 */

const ALLOWED_SYMBOLS = new Set(["CMT.CN"]);
const ALLOWED_RANGES = new Set(["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"]);
const ALLOWED_INTERVALS = new Set(["1m", "5m", "15m", "30m", "60m", "1d", "1wk", "1mo"]);

const EDGE_CACHE_SECONDS = 60;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }

    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({
        ok: true,
        service: "cmt-ticker-proxy",
        endpoints: ["/chart?symbol=CMT.CN&range=1y&interval=1d"],
      });
    }

    if (url.pathname !== "/chart") {
      return json({ error: "Not found" }, 404);
    }

    const symbol = (url.searchParams.get("symbol") || "CMT.CN").toUpperCase();
    const range = url.searchParams.get("range") || "1y";
    const interval = url.searchParams.get("interval") || "1d";

    if (!ALLOWED_SYMBOLS.has(symbol)) return json({ error: "Symbol not allowed" }, 400);
    if (!ALLOWED_RANGES.has(range)) return json({ error: "Range not allowed" }, 400);
    if (!ALLOWED_INTERVALS.has(interval)) return json({ error: "Interval not allowed" }, 400);

    // Edge cache keyed by the normalized request — same query = same key
    const cacheKey = new Request(
      `https://cmt-proxy.cache/chart?symbol=${symbol}&range=${range}&interval=${interval}`,
      { method: "GET" }
    );
    const cache = caches.default;

    let response = await cache.match(cacheKey);
    if (response) {
      return withCors(response, { "X-Cache": "HIT" });
    }

    const upstream = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
                     `?interval=${interval}&range=${range}&includePrePost=false`;

    let yahooRes;
    try {
      yahooRes = await fetch(upstream, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; CMT-Ticker-Proxy/1.0)",
          "Accept": "application/json",
        },
        cf: { cacheTtl: EDGE_CACHE_SECONDS, cacheEverything: true },
      });
    } catch (err) {
      return json({ error: "Upstream fetch failed", detail: String(err) }, 502);
    }

    if (!yahooRes.ok) {
      return json({ error: "Upstream error", status: yahooRes.status }, 502);
    }

    const body = await yahooRes.text();

    response = new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${EDGE_CACHE_SECONDS}, s-maxage=${EDGE_CACHE_SECONDS}`,
        ...CORS_HEADERS,
        "X-Cache": "MISS",
      },
    });

    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function withCors(response, extraHeaders = {}) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}
