# Sim Companies Market Signals

Static dashboard for spotting Sim Companies market buy/sell opportunities with the SimCoTools API.

## Run

Run the included local proxy server, then open the local URL:

```powershell
python server.py
```

If Python is not available locally, you can run the Node fallback server instead:

```powershell
node server.mjs
```

The app uses:

- `/v1/realms/{realm}/resources`
- `/v1/realms/{realm}/market/resources/{resource}/{quality}/candlesticks`

The browser calls the local `/api` proxy because SimCoTools does not currently send CORS headers for direct browser requests. The scanner spaces requests to stay under the documented 2 requests/second API limit.

## Deploy

The project is ready for Vercel. Vercel serves the static files and uses `api/[...path].js` as the `/api/...` proxy to SimCoTools.

No build command is required.

## How to use the app

1. Start the proxy server with `python server.py` and open `http://127.0.0.1:4173`.
2. Choose the realm and quality you want to analyze.
3. Search for a resource by name. The autocomplete uses the live SimCoTools resource catalog, so partial searches like `pow` or `resear` will show matching resources.
4. Select a resource from autocomplete, then click `Add Buy` or `Add Sell`.
5. Saved buy and sell resources appear as chips in their respective lists. Click `x` on a chip to remove it.
6. Click `Refresh Lists` to fetch fresh daily candlestick data and update the dashboard.
7. Saved lists persist in the browser between sessions using `localStorage`, separated by realm.

The buying tab focuses on resources near historical lows or close to 1-year / 2-year historical price anchors. The selling tab focuses on resources near historical highs. `Near low/high %` controls how close a price must be to historical extremes, while `Year match %` controls how tightly the current price must match historical anchors.
