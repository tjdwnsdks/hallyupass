// Supabase REST로 upsert (패키지 불필요)
const BASE = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '') + '/rest/v1';
const KEY  = process.env.SUPABASE_SERVICE_ROLE;

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates' // upsert
};

// raw_sources upsert: source,dataset,external_id,lang 기준
export async function upsertRaw(row) {
  const url = `${BASE}/raw_sources?on_conflict=source,dataset,external_id,lang`;
  const body = [{
    source: row.source,
    dataset: row.dataset,
    external_id: row.external_id,
    lang: row.lang ?? null,
    payload: row.payload ?? {},
    event_start: row.event_start ?? null,
    event_end: row.event_end ?? null,
    city: row.city ?? null,
    fetched_at: new Date().toISOString()
  }];

  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!r.ok) {
    const t = await r.text().catch(()=>'');
    throw new Error(`raw_sources upsert ${r.status} ${t}`);
  }
  return true;
}
