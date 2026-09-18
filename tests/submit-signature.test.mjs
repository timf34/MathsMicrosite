import test from 'node:test';
import assert from 'node:assert/strict';
import { submitSignature } from '../src/scripts/submit-signature.mjs';
const payload = { submissionId: 'unchanged-id', email: 'example@example.com' };
const response = (status, data) => new Response(JSON.stringify(data), { status });
test('retries lost acknowledgements and busy responses with identical payloads', async () => {
  const bodies = [], waits = [], attempts = [];
  await submitSignature(payload, {
    fetchImpl: async (_, options) => {
      bodies.push(options.body);
      if (bodies.length === 1) throw new TypeError('Connection lost after save');
      return bodies.length === 2 ? response(503, { error: 'Busy' }) : response(200, { ok: true });
    }, sleep: async ms => waits.push(ms), random: () => 0, onRetry: n => attempts.push(n),
  });
  assert.equal(new Set(bodies).size, 1);
  assert.deepEqual(attempts, [2, 3]);
  assert.deepEqual(waits, [1000, 3000]);
});
test('stops after three temporary failures and reports failure', async () => {
  let count = 0;
  await assert.rejects(submitSignature(payload, {
    fetchImpl: async () => { count++; return response(503, { error: 'Try again' }); },
    sleep: async () => {},
  }), /Try again/);
  assert.equal(count, 3);
});
test('does not retry validation, consent, spam or rate-limit rejections', async () => {
  for (const status of [400, 403, 415, 429]) {
    let count = 0;
    await assert.rejects(submitSignature(payload, {
      fetchImpl: async () => { count++; return response(status, { error: 'Rejected' }); },
      sleep: async () => { assert.fail('Unexpected retry'); },
    }), /Rejected/);
    assert.equal(count, 1);
  }
});
test('never treats malformed or negative success responses as confirmation', async () => {
  for (const data of [null, {}, { ok: false }]) {
    await assert.rejects(submitSignature(payload, { fetchImpl: async () => response(200, data) }), /could not confirm/);
  }
});

test('retries a response interrupted while reading its body', async () => {
  let count = 0;
  await submitSignature(payload, {
    fetchImpl: async () => ++count === 1
      ? { ok: true, status: 200, json: async () => { throw new TypeError('Body interrupted'); } }
      : response(200, { ok: true }),
    sleep: async () => {},
  });
  assert.equal(count, 2);
});
test('successful first attempt does not retry', async () => {
  let count = 0;
  await submitSignature(payload, {
    fetchImpl: async () => { count++; return response(200, { ok: true }); },
    sleep: async () => assert.fail('Unexpected retry'),
  });
  assert.equal(count, 1);
});
