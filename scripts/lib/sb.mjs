const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE;
const H = { 'apikey':SB_KEY, 'Authorization':`Bearer ${SB_KEY}`, 'Content-Type':'application/json' };

export async function upsert(table, rows){
  if(!rows?.length) return {count:0};
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method:'POST', headers:{...H,'Prefer':'resolution=merge-duplicates'}, body: JSON.stringify(rows)
  });
  if(!r.ok) throw new Error(`${table} upsert ${r.status} ${await r.text()}`);
  return {count: rows.length};
}
export async function selectRawRecent(hours=72){
  const from = new Date(Date.now()-hours*3600*1000).toISOString();
  const r = await fetch(`${SB_URL}/rest/v1/raw_sources?select=*&fetched_at=gte.${from}`, { headers: H });
  if(!r.ok) throw new Error(`raw select ${r.status} ${await r.text()}`);
  return r.json();
}
