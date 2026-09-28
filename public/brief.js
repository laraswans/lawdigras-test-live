const root = document.getElementById('brief');
const matterId = new URLSearchParams(location.search).get('matter');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clio = (kind, id) => `https://app.clio.com/nc/#/${kind}/${encodeURIComponent(id)}`;
const state = msg => { root.innerHTML = `<p class="state">${esc(msg)}</p>`; };
const list = (items, empty) => items.length ? `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>` : `<p class="empty">${esc(empty)}</p>`;
const date = d => d ? new Date(d).toLocaleDateString() : 'none recorded';

function digest(section, kind, empty) {
  return `${section.summary ? `<p>${esc(section.summary)}</p>` : ''}${list(section.items.map(i => `${esc(i.text)} <a href="${clio(kind, i.source_id)}" target="_blank" rel="noopener">source</a>`), empty)}`;
}

function render(b) {
  const t = b.tasks;
  root.innerHTML = `
    <header><h1>${esc(b.matter.number)} · ${esc(b.matter.client)}</h1>
      <p>Stage: <b>${esc(b.matter.stage ?? 'not set')}</b> · Last client contact: <b>${esc(date(b.lastClientContact?.date))}</b></p></header>
    <section><h2>Recent notes</h2>${digest(b.digests.notes, 'notes', 'No notes on this matter yet.')}</section>
    <section><h2>Recent communications</h2>${digest(b.digests.communications, 'communications', 'No communications yet.')}</section>
    <section><h2>Tasks</h2>
      <h3>Overdue (${t.overdue.length})</h3>${list(t.overdue.map(x => esc(x.name)), 'Nothing overdue.')}
      <h3>Waiting on a provider (${t.waiting.length})</h3>${list(t.waiting.map(x => esc(x.name)), 'Nothing pending with providers.')}
      <h3>Upcoming (${t.upcoming.length})</h3>${list(t.upcoming.map(x => `${esc(x.name)} · ${esc(date(x.due_at))}`), 'No upcoming tasks.')}</section>
    <section><h2>Coverage and expenses</h2>
      ${list(b.policyLimits.map(esc), 'Policy limits not entered in Clio.')}
      <p>Firm expenses to date: $${b.expensesToDate.toFixed(2)}</p></section>
    <section><h2>Documents</h2>${list(b.documents.map(d => `<a href="${clio('documents', d.id)}" target="_blank" rel="noopener">${esc(d.name)}</a>`), 'No documents uploaded.')}</section>`;
}

async function load() {
  if (!matterId) return state('Add ?matter=<Clio matter id> to the address to open a brief.');
  state('Loading the brief from Clio...');
  try {
    const res = await fetch(`/api/matters/${encodeURIComponent(matterId)}/brief`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return state(body.error ?? 'Could not load this matter.');
    render(body);
  } catch {
    state('Could not reach the server. Check your connection and reload.');
  }
}
load();
