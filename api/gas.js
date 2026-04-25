// Vercel serverless proxy — forwards all requests to Google Apps Script
// GAS_URL and GAS_API_KEY are set in Vercel Environment Variables.
// The browser never sees either value — they're injected server-side.
//
// PATCHED v2:
//  - Added 25s AbortController timeout (GAS cold starts can take 10-20s)
//  - Set maxDuration = 30s in Vercel config (add "maxDuration": 30 to vercel.json)
//  - Returns proper error body on timeout so the client outbox retries

const GAS_URL     = process.env.GAS_URL;
const GAS_API_KEY = process.env.GAS_API_KEY;

// Vercel Hobby plan max = 10s; Pro plan max = 60s.
// Set this to match your plan. GAS cold starts need ~15-20s.
const GAS_TIMEOUT_MS = 25000;

export const config = {
  maxDuration: 30, // seconds — requires Vercel Pro (or set to 10 on Hobby)
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!GAS_URL)     return res.status(500).json({ ok: false, error: 'GAS_URL not set in Vercel environment variables' });
  if (!GAS_API_KEY) return res.status(500).json({ ok: false, error: 'GAS_API_KEY not set in Vercel environment variables' });

  // Create an AbortController so we can time out the GAS request
  // without Vercel cutting us off mid-stream.
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), GAS_TIMEOUT_MS);

  try {
    if (req.method === 'GET') {
      const params = new URLSearchParams(req.query);
      params.set('key', GAS_API_KEY);
      const response = await fetch(`${GAS_URL}?${params.toString()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const text = await response.text();
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).send(text);
    }

    if (req.method === 'POST') {
      let body = {};
      try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch(e) {}
      body.key = GAS_API_KEY;
      const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' }, // GAS doPost requires text/plain
        body: JSON.stringify(body),
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const text = await response.text();
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).send(text);
    }

    clearTimeout(timeoutId);
    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error('GAS request timed out after', GAS_TIMEOUT_MS, 'ms');
      // Return a retriable error — the client outbox will try again
      return res.status(504).json({ ok: false, error: 'GAS timeout — request took too long. The event may still have been saved. Client will retry.' });
    }
    console.error('Proxy error:', err.message);
    return res.status(502).json({ ok: false, error: 'Proxy error: ' + err.message });
  }
}
