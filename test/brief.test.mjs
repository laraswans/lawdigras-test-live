import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DIGEST_STORE = join(mkdtempSync(join(tmpdir(), 'brief-')), 'digests.json');
const { selectSignal, taskStates, lastClientContact, fingerprint, digestSection } = await import('../server/digest.mjs');
const { providerView } = await import('../server/provider.mjs');

const now = Date.parse('2026-10-02T12:00:00Z');
test('signal selection ranks recent treatment above old admin', () => {
  const items = [{ id: 1, subject: 'Filing fee', date: '2026-01-01' }, { id: 2, subject: 'Client called about surgery date', date: '2026-09-28' }];
  assert.deepEqual(selectSignal(items, now).map(i => i.id), [2, 1]);
});
test('tasks split into overdue, waiting on a provider, upcoming and done', () => {
  const s = taskStates([{ name: 'By medical provider: Northside PT', due_at: '2026-09-01' }, { name: 'Draft demand', due_at: '2026-09-01' }, { name: 'Send HIPAA', due_at: '2026-10-09' }, { name: 'Old', completed_at: '2026-08-01' }], now);
  assert.deepEqual([s.waiting.length, s.overdue.length, s.upcoming.length, s.done.length], [1, 1, 1, 1]);
});
test('last client contact comes from the latest client-touching record', () => {
  assert.equal(lastClientContact([{ id: 1, detail: 'Spoke with client', date: '2026-09-20' }], [{ id: 9, body: 'Adjuster email', date: '2026-09-30' }]).source.id, 1);
});
test('a digest is reused until a record changes', async () => {
  let calls = 0; const call = async () => { calls++; return { summary: 's', items: [{ text: 't', source_id: 1 }, { text: 'invented', source_id: 99 }] }; };
  const notes = [{ id: 1, detail: 'x', updated_at: '2026-09-01' }];
  const first = await digestSection(7, 'notes', notes, call);
  assert.deepEqual(first.items.map(i => i.source_id), [1]); // ungrounded items are dropped
  assert.equal((await digestSection(7, 'notes', notes, call)).cached, true);
  await digestSection(7, 'notes', [{ ...notes[0], updated_at: '2026-09-02' }], call);
  assert.equal(calls, 2);
  assert.notEqual(fingerprint(notes), fingerprint([{ ...notes[0], updated_at: '2026-09-02' }]));
});
test('provider view never carries valuation, digests, expenses or documents', () => {
  const brief = { matter: { number: 'M-1', client: 'C', stage: 'Treating' }, policyLimits: ['25/50', 'UM 100', 'MedPay 5'], valuation: '900000', expensesToDate: 10, documents: [{ id: 1 }], digests: { notes: {} }, tasks: { waiting: [{ name: 'By medical provider: Northside PT: records', due_at: null }] }, calendar: [] };
  const v = providerView(brief, { provider: 'Northside PT' });
  for (const k of ['valuation', 'digests', 'expensesToDate', 'documents']) assert.equal(k in v, false);
  assert.deepEqual(v.policyLimits, ['25/50', 'UM 100', 'MedPay 5']);
  assert.equal(v.pendingWithYou.length, 1);
});
