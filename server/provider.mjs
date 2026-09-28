// What a treating provider may see. The view is built from an allowlist, so anything new in
// the internal brief stays internal until someone decides otherwise.
export const PROVIDER_SECTIONS = ['stage', 'policyLimits', 'pendingWithYou', 'upcoming', 'update'];
// Never shared, whatever the toggles say: valuation, internal digests, expenses, documents.

export function providerView(brief, { provider, sections = PROVIDER_SECTIONS, update = '' }) {
  const on = new Set(sections.filter(s => PROVIDER_SECTIONS.includes(s)));
  const view = { matter: { number: brief.matter.number, client: brief.matter.client }, provider };
  if (on.has('stage')) view.stage = brief.matter.stage;
  if (on.has('policyLimits')) view.policyLimits = brief.policyLimits; // the three lines as entered, never summed
  if (on.has('pendingWithYou')) {
    const mine = `by medical provider: ${String(provider).toLowerCase()}`;
    view.pendingWithYou = brief.tasks.waiting.filter(t => t.name.toLowerCase().startsWith(mine)).map(t => ({ name: t.name, due_at: t.due_at }));
  }
  if (on.has('upcoming')) view.upcoming = brief.calendar.map(e => ({ summary: e.summary, start_at: e.start_at }));
  if (on.has('update') && update.trim()) view.update = update.trim().slice(0, 2000);
  return view;
}
