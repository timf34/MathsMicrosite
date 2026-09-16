import { createHmac } from 'node:crypto';

const MAX_BODY = 8192;
const message = 'Thank you—your signature has been submitted for review.';
const json = (data, status = 200, cache = 'no-store') => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' },
});
const text = (value, max, required = true) => typeof value === 'string'
  && (!required || value.trim().length > 0) && value.trim().length <= max && !/[\u0000-\u001f\u007f]/u.test(value);

export async function handleSignatures(request, { env = process.env, fetchImpl = fetch, clientIp = 'unknown' } = {}) {
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
  const endpoint = env.GOOGLE_SCRIPT_URL;
  const secret = env.GOOGLE_SCRIPT_SECRET;
  if (!endpoint || !secret) {
    return request.method === 'GET'
      ? json({ configured: false, signatories: [] })
      : json({ error: 'Signing is not open yet. Please check back soon.' }, 503);
  }
  // The destination is server configuration, never a visitor-supplied URL.
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint) || secret.length < 32) {
    return json({ error: 'Signing is temporarily unavailable. Please try again later.' }, 503);
  }
  let payload = { action: 'list', secret };
  if (request.method === 'POST') {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'Please submit from this website.' }, 403);
    if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: 'Invalid submission format.' }, 415);
    let body;
    try {
      const raw = await request.text();
      if (Buffer.byteLength(raw) > MAX_BODY) return json({ error: 'Submission is too large.' }, 413);
      body = JSON.parse(raw);
    } catch { return json({ error: 'Invalid submission.' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid submission.' }, 400);
    // A blocked submission must never look saved to a real visitor.
    if (body.website) return json({ error: 'Your submission was blocked by the spam check. Please reload the page and enter your details manually without autofill.' }, 400);
    if (!text(body.firstName, 70) || !text(body.lastName, 70) || !text(body.email, 254)
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) || !text(body.role ?? '', 100, false)
      || !text(body.institution ?? '', 150, false) || body.consent !== true || !/^[a-zA-Z0-9-]{16,80}$/.test(body.submissionId ?? '')) {
      return json({ error: 'Please enter your name and a valid email address, and confirm publication consent.' }, 400);
    }
    if (!Number.isFinite(body.elapsedMs) || body.elapsedMs < 1500) return json({ error: 'Please take a moment to check your details, then try again.' }, 400);
    payload = {
      action: 'submit', secret,
      name: `${body.firstName.trim()} ${body.lastName.trim()}`,
      email: body.email.trim().toLowerCase(), role: (body.role ?? '').trim(), consent: true,
      institution: (body.institution ?? '').trim(),
      submissionId: body.submissionId,
      clientKey: createHmac('sha256', secret).update(clientIp).digest('hex'),
    };
  }
  try {
    // Older deployed scripts ignore unknown fields. Check before writing so no affiliation is lost.
    if (request.method === 'POST' && payload.institution) {
      const capabilityResponse = await fetchImpl(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', secret }), signal: AbortSignal.timeout(8000), redirect: 'follow',
      });
      const capability = capabilityResponse.ok ? await capabilityResponse.json() : null;
      if (capability?.ok !== true || capability?.supportsInstitution !== true) {
        return json({ error: 'Institution / company submissions are not available yet. Please try again later, or leave that optional field blank.' }, 503);
      }
    }
    const response = await fetchImpl(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(20000), redirect: 'follow',
    });
    if (!response.ok) throw new Error('Upstream unavailable');
    const result = await response.json();
    if (!result || result.ok !== true) {
      if (result?.code === 'RATE_LIMIT') return json({ error: 'Too many submissions. Please try again in ten minutes.' }, 429);
      throw new Error('Upstream rejected request');
    }
    if (request.method === 'POST') return json({ ok: true, message });
    if (!Array.isArray(result.signatories)) throw new Error('Invalid upstream list');
    // Explicit public allowlist, even if the script accidentally returns extra fields.
    const signatories = result.signatories.map(person => {
      if (!person || !text(person.name, 141) || !text(person.role ?? '', 100, false) || !text(person.institution ?? '', 150, false)) throw new Error('Invalid upstream record');
      return { name: person.name.trim(), role: (person.role ?? '').trim(), ...(person.institution?.trim() ? { institution: person.institution.trim() } : {}) };
    });
    return json({ configured: true, signatories }, 200, 'public, max-age=0, s-maxage=60');
  } catch {
    // Do not log or return submissions, upstream responses, or the shared secret.
    return json({ error: request.method === 'GET'
      ? 'The signatory list is temporarily unavailable. Please try again shortly.'
      : 'We could not confirm your submission. Please try again; retries will not add duplicates.' }, 503);
  }
}
