import { createHash } from 'node:crypto';
import * as clio from './clio.mjs';
import { jsonStore } from './store.mjs';

const digests = jsonStore(process.env.DIGEST_STORE ?? 'data/digests.json');
const MODEL = process.env.DIGEST_MODEL ?? 'claude-sonnet-5';
const CLIENT_CONTACT = /\b(client|called|spoke with|voicemail|texted)\b/i;
const when = i => Date.parse(i.date ?? i.updated_at);
const text = i => `${i.subject ?? i.name ?? ''} ${i.detail ?? i.body ?? i.description ?? ''}`;

export async function loadMatter(id) {
  const [matter, notes, communications, tasks, calendar, documents, expenses] = await Promise.all([
    clio.getMatter(id), clio.getNotes(id), clio.getCommunications(id), clio.getTasks(id),
    clio.getCalendar(id), clio.getDocuments(id), clio.getExpenses(id),
  ]);
  return { matter, fields: clio.customFieldsByName(matter), notes, communications, tasks, calendar, documents, expenses };
}

// A section only changes when one of its records is added, removed or updated.
export const fingerprint = items => createHash('sha256').update(items.map(i => `${i.id}:${i.updated_at}`).sort().join('|')).digest('hex').slice(0, 16);

// Signal selection: recent items, deadlines, treatment and client contact rank first; capped.
export function selectSignal(items, now = Date.now(), limit = 40) {
  const score = i => {
    const days = (now - when(i)) / 86400000;
    return (days < 30 ? 3 : days < 90 ? 1 : 0)
      + (/deadline|hearing|deposition|IME|surgery|treatment/i.test(text(i)) ? 2 : 0)
      + (CLIENT_CONTACT.test(text(i)) ? 1 : 0);
  };
  return [...items].sort((a, b) => score(b) - score(a) || when(b) - when(a)).slice(0, limit);
}

// No Clio field holds this, so it is derived from notes and communications that mention the client.
export function lastClientContact(notes, communications) {
  const latest = [...notes, ...communications].filter(i => CLIENT_CONTACT.test(text(i))).sort((a, b) => when(b) - when(a))[0];
  return latest ? { date: latest.date ?? latest.updated_at, source: { type: 'body' in latest ? 'communication' : 'note', id: latest.id } } : null;
}

export function taskStates(tasks, now = Date.now()) {
  const out = { overdue: [], upcoming: [], waiting: [], done: [] };
  for (const t of tasks) {
    if (t.completed_at || t.status === 'complete') out.done.push(t);
    else if (/^By medical provider:/i.test(t.name ?? '')) out.waiting.push(t);
    else if (t.due_at && Date.parse(t.due_at) < now) out.overdue.push(t);
    else out.upcoming.push(t);
  }
  return out;
}

async function callClaude(system, content) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(60000),
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, system, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) throw new Error(`Digest model returned ${res.status}`);
  const out = (await res.json()).content?.find(b => b.type === 'text')?.text ?? '';
  return JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
}

const SYSTEM = 'You summarise one section of a personal-injury matter for an attorney who has ninety seconds. Return JSON {"summary": string, "items": [{"text": string, "source_id": number}]}. Every item must cite the source_id of the record it came from. Use only the records given.';

export async function digestSection(matterId, name, items, call = callClaude) {
  const key = `${matterId}:${name}`, fp = fingerprint(items), cached = await digests.get(key);
  if (cached?.fingerprint === fp) return { ...cached.digest, cached: true };
  if (!items.length) return { summary: '', items: [], cached: false };
  const picked = selectSignal(items);
  const records = picked.map(i => ({ id: i.id, date: i.date ?? i.updated_at, subject: i.subject ?? i.name, text: text(i).slice(0, 1200) }));
  const digest = await call(SYSTEM, `Section: ${name}\nRecords:\n${JSON.stringify(records)}`);
  const known = new Set(picked.map(i => i.id));
  digest.items = (digest.items ?? []).filter(i => known.has(i.source_id)); // drop anything the model could not ground
  await digests.set(key, { fingerprint: fp, digest, at: new Date().toISOString() });
  return { ...digest, cached: false };
}

export async function buildBrief(matterId) {
  const m = await loadMatter(matterId);
  const [notes, communications] = await Promise.all([
    digestSection(matterId, 'notes', m.notes),
    digestSection(matterId, 'communications', m.communications),
  ]);
  return {
    matter: { id: m.matter.id, number: m.matter.display_number, description: m.matter.description, stage: m.matter.matter_stage?.name ?? null, client: m.matter.client?.name ?? null },
    policyLimits: String(m.fields['Policy Limits'] ?? '').split(/\r?\n/).map(s => s.trim()).filter(Boolean),
    valuation: m.fields['Case Valuation'] ?? null,
    lastClientContact: lastClientContact(m.notes, m.communications),
    tasks: taskStates(m.tasks),
    calendar: m.calendar.filter(e => Date.parse(e.start_at) >= Date.now()).sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at)).slice(0, 10),
    expensesToDate: m.expenses.reduce((sum, e) => sum + Number(e.total ?? 0), 0),
    documents: m.documents.map(d => ({ id: d.id, name: d.name, category: d.document_category?.name ?? null })),
    digests: { notes, communications },
  };
}
