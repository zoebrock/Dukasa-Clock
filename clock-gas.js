// Vercel serverless proxy — forwards all requests to Google Apps Script
// GAS_URL and GAS_API_KEY are set in Vercel Environment Variables.
// The browser never sees either value — they're injected server-side.

const GAS_URL     = process.env.GAS_URL;
const GAS_API_KEY = process.env.GAS_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!GAS_URL)     return res.status(500).json({ ok: false, error: 'GAS_URL not set in Vercel environment variables' });
  if (!GAS_API_KEY) return res.status(500).json({ ok: false, error: 'GAS_API_KEY not set in Vercel environment variables' });

  try {
    if (req.method === 'GET') {
      const params = new URLSearchParams(req.query);
      params.set('key', GAS_API_KEY);
      const response = await fetch(`${GAS_URL}?${params.toString()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        redirect: 'follow',
      });
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
      });
      const text = await response.text();
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).send(text);
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  } catch (err) {
    console.error('Proxy error:', err.message);
    return res.status(502).json({ ok: false, error: 'Proxy error: ' + err.message });
  }
}
