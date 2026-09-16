import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { handleSignatures } from '../server/signatures.mjs';

const env = { GOOGLE_SCRIPT_URL: 'https://script.google.com/macros/s/test-deployment/exec', GOOGLE_SCRIPT_SECRET: 'test-secret-that-is-at-least-32-characters' };
const valid = { firstName: 'Test', lastName: 'Reader', email: 'test@example.com', role: 'Teacher', consent: true, website: '', submissionId: '12345678-1234-1234-1234-123456789012', elapsedMs: 3000 };
const request = (body = valid, headers = {}) => new Request('https://example.org/api/signatures', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://example.org', ...headers }, body: JSON.stringify(body) });
const read = () => new Request('https://example.org/api/signatures');
const success = async () => Response.json({ ok: true });

test('not configured: clear disabled state and no accepted submission', async () => {
  assert.deepEqual(await (await handleSignatures(read(), { env: {} })).json(), { configured: false, signatories: [] });
  assert.equal((await handleSignatures(request(), { env: {} })).status, 503);
});
test('public response projects only name and role, with a bounded cache', async () => {
  const result = await handleSignatures(read(), { env, fetchImpl: async () => Response.json({ ok: true, signatories: [{ name: ' Test Reader ', role: 'Teacher', email: 'private@example.com', notes: 'private', secret: 'private' }] }) });
  assert.deepEqual(await result.json(), { configured: true, signatories: [{ name: 'Test Reader', role: 'Teacher' }] });
  assert.equal(result.headers.get('cache-control'), 'public, max-age=0, s-maxage=60');
});
test('empty approved list is a configured working service', async () => {
  const result = await handleSignatures(read(), { env, fetchImpl: async () => Response.json({ ok: true, signatories: [] }) });
  assert.deepEqual(await result.json(), { configured: true, signatories: [] });
});
test('visitor cannot set approval, rank, notes or raw IP in upstream submission', async () => {
  let forwarded;
  const result = await handleSignatures(request({ ...valid, status: 'Approved', priority: 1, notes: 'ignore moderation' }), {
    env, clientIp: '192.0.2.10', fetchImpl: async (_, options) => { forwarded = JSON.parse(options.body); return success(); },
  });
  assert.equal(result.status, 200);
  assert.equal(forwarded.action, 'submit');
  assert.equal(forwarded.status, undefined);
  assert.equal(forwarded.priority, undefined);
  assert.equal(forwarded.notes, undefined);
  assert.match(forwarded.clientKey, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(forwarded).includes('192.0.2.10'));
  assert.equal(result.headers.get('cache-control'), 'no-store');
});
test('honeypot rejection never claims the signature was saved', async () => {
  const result = await handleSignatures(request({ ...valid, website: 'spam' }), { env, fetchImpl: () => { throw new Error('Must not run'); } });
  assert.equal(result.status, 400);
  const body = await result.json();
  assert.equal(body.ok, undefined);
  assert.match(body.error, /spam check/);
});
test('reject missing consent, bad email, blank name, invalid ID and rushed submissions', async () => {
  for (const change of [{ consent: false }, { email: 'no-email' }, { firstName: '   ' }, { lastName: 'x'.repeat(71) }, { submissionId: 'short' }, { elapsedMs: 1 }, { role: 'bad\nrole' }]) {
    assert.equal((await handleSignatures(request({ ...valid, ...change }), { env, fetchImpl: success })).status, 400);
  }
});
test('reject cross-origin and oversized requests', async () => {
  assert.equal((await handleSignatures(request(valid, { origin: 'https://unrelated.example' }), { env })).status, 403);
  assert.equal((await handleSignatures(request({ ...valid, extra: 'a'.repeat(9000) }), { env })).status, 413);
});
test('invalid or failed Google responses never claim success or leak details', async () => {
  for (const fetchImpl of [async () => { throw new Error('private internal URL'); }, async () => Response.json({ ok: false, secret: 'private' }), async () => new Response('<html>Google sign-in</html>')]) {
    const result = await handleSignatures(request(), { env, fetchImpl });
    assert.equal(result.status, 503);
    assert.ok(!(await result.text()).includes('private'));
  }
});
test('upstream throttling gives a retryable public error', async () => {
  const result = await handleSignatures(request(), { env, fetchImpl: async () => Response.json({ ok: false, code: 'RATE_LIMIT' }) });
  assert.equal(result.status, 429);
});

const source = readFileSync(new URL('../scripts/google-signatures.gs', import.meta.url), 'utf8');
const headers = ['Name', 'Email', 'Role', 'Status', 'Priority', 'Submitted', 'Consent', 'Source', 'Submission ID', 'Notes', 'Institution / company'];
function googleHarness(initial = [], formulaRows = new Set()) {
  const rows = [headers.slice(), ...initial.map(r => [...r, ...Array(Math.max(0, 11 - r.length)).fill('')])];
  const cache = new Map();
  const sheet = {
    getLastRow: () => rows.length,
    getMaxRows: () => rows.length,
    insertRowsAfter: (_, count) => { for (let i = 0; i < count; i++) rows.push(Array(11).fill('')); },
    getRange: (row, col, count, width) => ({
      getValues: () => rows.slice(row - 1, row - 1 + count).map(r => r.slice(col - 1, col - 1 + width)),
      getFormulas: () => [Array.from({ length: width }, (_, i) => formulaRows.has(row) && i === 0 ? '=IF(TRUE,"","")' : '')],
      setValues: values => values.forEach((r, i) => { rows[row - 1 + i] = [...r]; }),
    }),
    appendRow: row => rows.push(row),
  };
  const context = vm.createContext({
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }), flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === 'SHARED_SECRET' ? env.GOOGLE_SCRIPT_SECRET : 'sheet-id' }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => text }) },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key), put: (key, value) => cache.set(key, value) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  });
  vm.runInContext(source, context);
  const call = payload => JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ secret: env.GOOGLE_SCRIPT_SECRET, ...payload }) } }));
  return { call, rows, context, cache };
}
const upstream = { action: 'submit', name: 'Test Reader', email: 'test@example.com', role: 'Teacher', consent: true, submissionId: valid.submissionId, clientKey: 'a'.repeat(64) };
test('Sheet filters moderation and consent, sorts by priority, and never returns private fields', () => {
  const row = (name, status, priority, consent = true) => [name, 'private@example.com', 'Role', status, priority, '', consent, 'Manual', '', 'Private notes'];
  const sheet = googleHarness([row('Pending', 'Pending', 0), row('Hidden', 'Hidden', 0), row('Rejected', 'Rejected', 0), row('No consent', 'Approved', 0, false), row('Ordinary', 'Approved', ''), row('Featured', 'Approved', 1), row('Second', 'Approved', 2)]);
  assert.deepEqual(sheet.call({ action: 'list' }), { ok: true, supportsInstitution: true, signatories: [{ name: 'Featured', role: 'Role' }, { name: 'Second', role: 'Role' }, { name: 'Ordinary', role: 'Role' }] });
});
test('new Sheet entries are Pending and protected from formula execution', () => {
  const sheet = googleHarness();
  assert.deepEqual(sheet.call({ ...upstream, name: '=IMPORTXML("bad")', role: '+formula', status: 'Approved', priority: 1 }), { ok: true });
  assert.equal(sheet.rows[1][0][0], "'");
  assert.equal(sheet.rows[1][2], "'+formula");
  assert.equal(sheet.rows[1][3], 'Pending');
  assert.equal(sheet.rows[1][4], '');
  assert.equal(sheet.rows[1][6], true);
  assert.deepEqual(sheet.call({ action: 'list' }).signatories, []);
});
test('retries and repeated email cannot duplicate or change approved rows', () => {
  const sheet = googleHarness();
  sheet.call(upstream);
  sheet.rows[1][3] = 'Approved';
  sheet.call({ ...upstream, name: 'Changed' });
  sheet.call({ ...upstream, submissionId: 'different-id-123456789', name: 'Another name' });
  assert.equal(sheet.rows.length, 2);
  assert.equal(sheet.rows[1][0], 'Test Reader');
  assert.equal(sheet.rows[1][3], 'Approved');
});
test('changing status or removing consent removes a public row', () => {
  const sheet = googleHarness();
  sheet.call(upstream);
  sheet.rows[1][3] = 'Approved';
  assert.equal(sheet.call({ action: 'list' }).signatories.length, 1);
  sheet.rows[1][6] = false;
  assert.equal(sheet.call({ action: 'list' }).signatories.length, 0);
  sheet.rows[1][6] = true;
  sheet.rows[1][3] = 'Hidden';
  assert.equal(sheet.call({ action: 'list' }).signatories.length, 0);
});
test('Sheet rejects unauthorised callers and fails closed when columns move', () => {
  const sheet = googleHarness();
  assert.equal(sheet.call({ action: 'list', secret: 'wrong' }).code, 'UNAUTHORIZED');
  sheet.rows[0].reverse();
  assert.equal(sheet.call({ action: 'list' }).code, 'UNAVAILABLE');
});
test('Sheet applies the shared connection limit', () => {
  const sheet = googleHarness();
  for (let i = 0; i < 8; i++) assert.equal(sheet.call({ ...upstream, email: `test${i}@example.com`, submissionId: `submission-id-number-${i}` }).ok, true);
  assert.equal(sheet.call({ ...upstream, email: 'ninth@example.com', submissionId: 'submission-id-number-9' }).code, 'RATE_LIMIT');
  assert.equal(sheet.rows.length, 9);
});
test('website-to-script contract works for pending, approved and hidden states', async () => {
  const sheet = googleHarness();
  const fetchImpl = async (_, options) => Response.json(sheet.call(JSON.parse(options.body)));
  assert.equal((await handleSignatures(request(), { env, fetchImpl })).status, 200);
  assert.deepEqual((await (await handleSignatures(read(), { env, fetchImpl })).json()).signatories, []);
  sheet.rows[1][3] = 'Approved';
  assert.deepEqual((await (await handleSignatures(read(), { env, fetchImpl })).json()).signatories, [{ name: 'Test Reader', role: 'Teacher' }]);
  sheet.rows[1][3] = 'Hidden';
  assert.deepEqual((await (await handleSignatures(read(), { env, fetchImpl })).json()).signatories, []);
});

test('submissions fill checkbox-only rows near the top without overwriting existing entries', () => {
  const blank = () => ['', '', '', '', '', '', false, '', '', ''];
  const existing = ['Existing signer', 'existing@example.com', '', 'Pending', '', '', true, 'Website', 'existing-submission', ''];
  const sheet = googleHarness([...Array.from({ length: 999 }, blank), existing]);
  assert.equal(sheet.call(upstream).ok, true);
  assert.equal(sheet.rows[1][0], 'Test Reader');
  assert.equal(sheet.rows[1000][0], 'Existing signer');
  assert.equal(sheet.rows.length, 1001);
  assert.equal(sheet.call({ ...upstream, email: 'second@example.com', submissionId: 'second-submission-id' }).ok, true);
  assert.equal(sheet.rows[2][1], 'second@example.com');
});
test('empty-looking rows with notes, checked consent or formulas are preserved', () => {
  const blank = () => ['', '', '', '', '', '', false, '', '', ''];
  const notes = blank(); notes[9] = 'Organiser is preparing this row';
  const consent = blank(); consent[6] = true;
  const sheet = googleHarness([notes, consent, blank(), blank()], new Set([4]));
  assert.equal(sheet.call(upstream).ok, true);
  assert.equal(sheet.rows[1][9], notes[9]);
  assert.equal(sheet.rows[2][6], true);
  assert.equal(sheet.rows[3][0], '');
  assert.equal(sheet.rows[4][0], 'Test Reader');
});

test('institution survives submission, moderation and public listing', async () => {
  const sheet = googleHarness();
  const fetchImpl = async (_, options) => Response.json(sheet.call(JSON.parse(options.body)));
  const result = await handleSignatures(request({ ...valid, institution: ' Example University ' }), { env, fetchImpl });
  assert.equal(result.status, 200);
  assert.equal(sheet.rows[1][10], 'Example University');
  assert.equal(sheet.rows[1][3], 'Pending');
  sheet.rows[1][3] = 'Approved';
  const list = await (await handleSignatures(read(), { env, fetchImpl })).json();
  assert.equal(list.signatories[0].institution, 'Example University');
  assert.equal(list.signatories[0].email, undefined);
});
test('old script cannot silently discard institution', async () => {
  const actions = [];
  const result = await handleSignatures(request({ ...valid, institution: 'University' }), {
    env, fetchImpl: async (_, options) => { actions.push(JSON.parse(options.body).action); return Response.json({ ok: true, signatories: [] }); },
  });
  assert.equal(result.status, 503);
  assert.deepEqual(actions, ['list']);
});
test('institution validation and formula protection', async () => {
  assert.equal((await handleSignatures(request({ ...valid, institution: 'x'.repeat(151) }), { env })).status, 400);
  const sheet = googleHarness();
  assert.equal(sheet.call({ ...upstream, institution: '=BAD()' }).ok, true);
  assert.equal(sheet.rows[1][10], "'=BAD()");
});

test('setup adds institution header while preserving existing sheet data and secret', () => {
  const sheet = googleHarness([['Existing', 'existing@example.com', '', 'Pending', '', '', true, '', '', 'Keep note']]);
  sheet.rows[0][10] = '';
  const chain = new Proxy({}, { get: (_, key) => key === 'build' ? () => ({}) : () => chain });
  const fakeSheet = {
    getLastRow: () => sheet.rows.length, getMaxRows: () => sheet.rows.length,
    getRange: (row, col, count, width) => ({
      getValues: () => sheet.rows.slice(row - 1, row - 1 + count).map(r => r.slice(col - 1, col - 1 + width)),
      getFormulas: () => Array.from({ length: count }, () => Array(width).fill('')),
      setValues: values => values.forEach((r, i) => r.forEach((v, j) => { sheet.rows[row - 1 + i][col - 1 + j] = v; })),
      setFontWeight: () => chain, setDataValidation() {}, setNumberFormat() {},
    }), setFrozenRows() {}, autoResizeColumns() {},
  };
  const saved = new Map([['SHARED_SECRET', 'existing-secret']]);
  sheet.context.PropertiesService = { getScriptProperties: () => ({ getProperty: k => saved.get(k), setProperty: (k,v) => saved.set(k,v) }) };
  sheet.context.SpreadsheetApp.getActiveSpreadsheet = () => ({ getId: () => 'sheet-id', getSheetByName: () => fakeSheet, toast() {} });
  sheet.context.SpreadsheetApp.newDataValidation = () => chain;
  sheet.context.setupSignatories();
  assert.equal(sheet.rows[0][10], 'Institution / company');
  assert.equal(sheet.rows[1][9], 'Keep note');
  assert.equal(saved.get('SHARED_SECRET'), 'existing-secret');
  sheet.context.setupSignatories();
  assert.equal(sheet.rows[1][0], 'Existing');
});
