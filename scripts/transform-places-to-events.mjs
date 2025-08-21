// raw_sources(dataset in food|stay|attraction) → events upsert
// 필요 env: SUPABASE_URL, SUPABASE_SERVICE_ROLE

const BASE = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_SERVICE_ROLE;
if(!BASE || !KEY){
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const DATASETS = ['food','stay','attraction'];     // 대상 dataset
const BATCH = 500;                                 // 한번에 읽을 행 수
const HOURS = Number(process.env.TRANSFORM_LOOKBACK_HOURS || '48'); // lookback

const hdr = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type':'application/json' };

// JSON 안전 파싱
const num = (v)=> (v==null || v==='') ? null : Number(v);
const pick = (o, keys)=> keys.find(k=> o?.[k]!=null && `${o[k]}`.length>0);

function mapRow(r){
  const p = r.payload || {};
  const title = p.title || p.firstimagealt || p.addr1 || 'Untitled';
  const address = p.addr1 || null;
  // TourAPI 좌표: mapx(경도=lng), mapy(위도=lat)
  const lng = num(p.mapx);
  const lat = num(p.mapy);
  const image = p.firstimage || p.firstimage2 || null;

  // 기간 필드가 없으면 null
  const start = p.eventstartdate || p.eventStartDate || null;
  const end   = p.eventenddate   || p.eventEndDate   || null;

  const city = p.addr1 ? p.addr1.split(' ')[0] : null; // 간단 추출

  return {
    source: 'tourapi',
    external_id: String(p.contentid || r.external_id || `${r.dataset}:${title}`),
    type: r.dataset,                 // 'food' | 'stay' | 'attraction'
    title,
    start_date: start ? start.slice(0,10) : null,
    end_date: end ? end.slice(0,10) : null,
    city,
    lat, lng,
    address,
    official_url: null,
    seller: null,
    ticket_options: null,
    tags: null,
    image
  };
}

async function fetchRaw(dataset){
  const sinceISO = new Date(Date.now() - HOURS*3600*1000).toISOString();
  let from=0, to=BATCH-1, out=[];
  while(true){
    const url = `${BASE}/rest/v1/raw_sources`+
      `?select=id,source,external_id,dataset,lang,payload,fetched_at`+
      `&dataset=eq.${dataset}`+
      `&fetched_at=gte.${sinceISO}`+
      `&order=fetched_at.asc&offset=${from}&limit=${BATCH}`;
    const r = await fetch(url, { headers: hdr });
    if(!r.ok){ throw new Error(`raw_sources fetch ${dataset} ${r.status}`); }
    const rows = await r.json();
    if(rows.length===0) break;
    out.push(...rows);
    if(rows.length < BATCH) break;
    from += BATCH;
  }
  return out;
}

async function upsertEvents(rows){
  if(rows.length===0) return 0;
  const url = `${BASE}/rest/v1/events`;
  const res = await fetch(url, {
    method:'POST',
    headers: {
      ...hdr,
      // PostgREST upsert
      Prefer: 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify(rows)
  });
  if(!res.ok){
    const t = await res.text();
    throw new Error(`events upsert ${res.status}: ${t}`);
  }
  const out = await res.json();
  return out.length;
}

async function run(){
  let total=0;
  for(const ds of DATASETS){
    console.log(`[TRANSFORM] dataset=${ds} lookback=${HOURS}h`);
    const raws = await fetchRaw(ds);
    const mapped = raws.map(mapRow);
    // chunk insert (1000씩)
    for(let i=0;i<mapped.length;i+=1000){
      const slice = mapped.slice(i, i+1000);
      const n = await upsertEvents(slice);
      total += n;
      console.log(`  → upserted ${n} rows (batch ${i+1}-${i+slice.length})`);
    }
  }
  console.log(`DONE transform-places-to-events: upserted total=${total}`);
}

run().catch(e=>{ console.error(e); process.exit(1); });
