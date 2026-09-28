// The token travels in the URL fragment, so it never reaches server logs or referrers.
const token = location.hash.slice(1);
const view = document.getElementById('view');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const list = (items, empty) => items?.length ? `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>` : `<p class="empty">${esc(empty)}</p>`;

document.getElementById('unlock').addEventListener('submit', async e => {
  e.preventDefault();
  view.innerHTML = '<p class="state">Opening...</p>';
  try {
    const res = await fetch('/api/share/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password: document.getElementById('password').value }) });
    const v = await res.json().catch(() => ({}));
    if (!res.ok) { view.innerHTML = `<p class="state">${esc(v.error ?? 'This link could not be opened.')}</p>`; return; }
    e.target.hidden = true;
    view.innerHTML = `
      <h1>${esc(v.matter.client)} · ${esc(v.matter.number)}</h1>
      ${v.stage !== undefined ? `<p>Case stage: <b>${esc(v.stage ?? 'not set')}</b></p>` : ''}
      ${v.update ? `<section><h2>Update from the firm</h2><p>${esc(v.update)}</p></section>` : ''}
      ${v.pendingWithYou ? `<section><h2>Waiting on your office</h2>${list(v.pendingWithYou.map(t => esc(t.name)), 'Nothing pending with your office.')}</section>` : ''}
      ${v.upcoming ? `<section><h2>Upcoming</h2>${list(v.upcoming.map(x => `${esc(x.summary)} · ${esc(new Date(x.start_at).toLocaleDateString())}`), 'Nothing scheduled.')}</section>` : ''}
      ${v.policyLimits ? `<section><h2>Policy limits</h2>${list(v.policyLimits.map(esc), 'Not entered.')}</section>` : ''}`;
  } catch {
    view.innerHTML = '<p class="state">Could not reach the firm\'s server. Try again shortly.</p>';
  }
});
