import test from 'node:test';
import assert from 'node:assert/strict';
import middleware, { checkPassword } from '../middleware.js';
const request = (path, credentials) => new Request('https://savemaths.ie' + path, {
  headers: credentials ? { authorization: 'Basic ' + btoa(credentials) } : {},
});
test('unauthenticated pages, assets and API are blocked without caching', () => {
  for (const path of ['/', '/explainer/', '/privacy/', '/api/signatures', '/sitemap.xml', '/_astro/file.js']) {
    const result = middleware(request(path));
    assert.equal(result.status, 401);
    assert.equal(result.headers.get('cache-control'), 'private, no-store');
    assert.match(result.headers.get('www-authenticate'), /^Basic/);
  }
});
test('only correct case-sensitive password permits access', () => {
  assert.equal(checkPassword(request('/', 'preview:HAMILTON')), null);
  assert.equal(checkPassword(request('/', ':HAMILTON')), null);
  assert.equal(checkPassword(request('/', 'preview:hamilton')).status, 401);
  assert.equal(checkPassword(new Request('https://savemaths.ie', { headers: { authorization: 'Basic !!!' } })).status, 401);
  assert.equal(middleware(request('/', 'preview:HAMILTON')).headers.get('x-middleware-next'), '1');
});
test('boolean false permits unauthenticated requests', () => {
  assert.equal(checkPassword(request('/'), false), null);
});
