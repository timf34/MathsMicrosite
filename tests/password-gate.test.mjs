import test from 'node:test';
import assert from 'node:assert/strict';
import middleware, { checkPassword } from '../middleware.js';
const request = (path, options) => new Request('https://savemaths.ie' + path, options);
const login = password => request('/__unlock', { method: 'POST', body: new URLSearchParams({ password }) });
test('unauthenticated paths show password-only form without browser prompt', async () => {
  for (const path of ['/', '/explainer/', '/privacy/', '/sitemap.xml', '/_astro/file.js']) {
    const result = await middleware(request(path));
    assert.equal(result.status, 401);
    assert.equal(result.headers.get('www-authenticate'), null);
    assert.equal(result.headers.get('cache-control'), 'private, no-store');
    assert.match(await result.text(), /name="password"/);
  }
  assert.equal((await middleware(request('/api/signatures'))).status, 401);
});
test('correct password issues secure cookie and unlocks pages and API', async () => {
  const result = await middleware(login('HAMILTON'));
  assert.equal(result.status, 303);
  assert.equal(result.headers.get('location'), '/');
  const cookie = result.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; Secure; SameSite=Lax/);
  for (const path of ['/', '/explainer/', '/api/signatures']) {
    assert.equal(await checkPassword(request(path, { headers: { cookie: cookie.split(';')[0] } })), null);
  }
});
test('incorrect password, forged cookies and cross-origin login are rejected', async () => {
  assert.equal((await middleware(login('hamilton'))).status, 401);
  assert.equal((await middleware(request('/', { headers: { cookie: '__Host-campaign-preview=HAMILTON' } }))).status, 401);
  assert.equal((await middleware(request('/__unlock', { method: 'POST', headers: { origin: 'https://elsewhere.test' }, body: new URLSearchParams({ password: 'HAMILTON' }) }))).status, 403);
});
test('boolean false bypasses the gate', async () => {
  assert.equal(await checkPassword(request('/'), false), null);
});
