// Clio Manage API v4 client. Read-only: this module only issues GET requests.
const BASE = process.env.CLIO_API_BASE ?? 'https://app.clio.com/api/v4';

export class ClioError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function get(path, params = {}, retries = 2) {
  const token = process.env.CLIO_ACCESS_TOKEN;
  if (!token) throw new ClioError('CLIO_ACCESS_TOKEN is not set', 401);
  const url = new URL(path.startsWith('http') ? path : `${BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    if (res.status === 429 && attempt < retries) {
      await new Promise(r => setTimeout(r, Number(res.headers.get('retry-after') ?? 2) * 1000));
      continue;
    }
    if (!res.ok) throw new ClioError(`Clio ${url.pathname} returned ${res.status}`, res.status);
    return res.json();
  }
}

// Follows meta.paging.next until Clio has no more pages.
async function all(path, params) {
  const out = [];
  let page = await get(path, { ...params, limit: 200 });
  for (;;) {
    out.push(...(page.data ?? []));
    const next = page.meta?.paging?.next;
    if (!next) return out;
    page = await get(next);
  }
}

export const getMatter = id => get(`matters/${id}.json`, { fields: 'id,display_number,description,status,open_date,matter_stage{name},client{id,name},custom_field_values{id,value,field_name}' }).then(r => r.data);
export const getNotes = id => all('notes.json', { matter_id: id, type: 'Matter', fields: 'id,subject,detail,date,updated_at,author{name}' });
export const getCommunications = id => all('communications.json', { matter_id: id, fields: 'id,subject,body,date,type,updated_at' });
export const getTasks = id => all('tasks.json', { matter_id: id, fields: 'id,name,description,status,due_at,completed_at,updated_at,assignee{name}' });
export const getCalendar = id => all('calendar_entries.json', { matter_id: id, fields: 'id,summary,start_at,end_at,updated_at' });
export const getDocuments = id => all('documents.json', { matter_id: id, fields: 'id,name,content_type,updated_at,document_category{name}' });
export const getExpenses = id => all('activities.json', { matter_id: id, type: 'ExpenseEntry', fields: 'id,date,total,note,updated_at' });

// Custom fields are resolved by name at runtime, so another firm's Clio works without code changes.
export function customFieldsByName(matter) {
  const out = {};
  for (const v of matter?.custom_field_values ?? []) if (v.field_name) out[v.field_name.trim()] = v.value;
  return out;
}
