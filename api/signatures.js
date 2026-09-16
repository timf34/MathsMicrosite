import { handleSignatures } from '../server/signatures.mjs';
export const config = { maxDuration: 30 };

// Works with Vercel's Node handler and Astro's local development middleware.
export default async function handler(req, res) {
  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.body !== undefined) body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    else {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += Buffer.byteLength(chunk);
        if (size > 8192) {
          res.writeHead(413, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ error: 'Submission is too large.' }));
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      body = Buffer.concat(chunks).toString();
    }
  }
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(key, value);
  const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const url = `${protocol}://${req.headers.host || 'localhost'}/api/signatures`;
  const request = new Request(url, { method: req.method, headers, body });
  const clientIp = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const response = await handleSignatures(request, { clientIp });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(await response.text());
}
