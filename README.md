# Cullinan Metals Ticker Proxy

A tiny Cloudflare Worker that proxies Yahoo Finance chart data for **CSE: CMT** (Yahoo symbol `CMT.CN`) with CORS headers, so a Webflow embed can fetch live + historical price data directly from the browser without relying on flaky public CORS proxies.

- Locked to the `CMT.CN` symbol and a fixed list of ranges/intervals — can't be abused as an open proxy.
- Cached at the Cloudflare edge for 60 seconds — unlimited concurrent viewers cost ~1 upstream request per minute per region.
- Free tier: 100,000 requests/day. With 60s edge cache, this comfortably serves a public marketing site.

---

## Deploy

### Option A — One-click (recommended)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/krlenk/cmt-ticker-proxy)

Click the button, sign into Cloudflare, accept the defaults. You'll get a URL like:

```
https://cmt-ticker-proxy.<your-cf-subdomain>.workers.dev
```

### Option B — CLI

```bash
npm install
npx wrangler login
npx wrangler deploy
```

---

## Use it from the Webflow embed

Once deployed, replace the proxy chain in your embed's JavaScript with your Worker URL:

```js
const PROXY = "https://cmt-ticker-proxy.<your-cf-subdomain>.workers.dev";

fetch(`${PROXY}/chart?symbol=CMT.CN&range=1y&interval=1d`)
  .then(r => r.json())
  .then(data => { /* render chart */ });
```

---

## Endpoints

### `GET /chart`

Query params:

| Param      | Required | Allowed values | Default |
|------------|----------|----------------|---------|
| `symbol`   | no       | `CMT.CN`       | `CMT.CN` |
| `range`    | no       | `1d` `5d` `1mo` `3mo` `6mo` `1y` `2y` `5y` `10y` `ytd` `max` | `1y` |
| `interval` | no       | `1m` `5m` `15m` `30m` `60m` `1d` `1wk` `1mo` | `1d` |

Returns the raw Yahoo Finance `chart` response JSON.

### `GET /health`

Returns `{ ok: true, ... }`.

---

## License

MIT
