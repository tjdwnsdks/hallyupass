import { getDataGoKrKey, ymd } from "./lib/env.mjs";
import { pagedJson } from "./lib/util.mjs";
import { buildUrl, getWithPreview, parseJsonOrThrow } from "./lib/http.mjs";

// Inputs
const KEY = getDataGoKrKey("DATA_GO_KR_TOURAPI");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) throw new Error("Missing Supabase env");

// Query window
const DAYS_AHEAD = Number(process.env.DAYS_AHEAD ?? 60);
const startYmd = ymd(new Date());
const endYmd = ymd(new Date(Date.now()+DAYS_AHEAD*86400000));

// Areas
const AREACODES = (process.env.AREACODES ?? "1,2").split(",").map(s=>s.trim()).filter(Boolean);

// Endpoint
const BASE = "https://apis.data.go.kr/B551011";
const PATH = "/KorService2/searchFestival2";

// Upsert to Supabase REST
async function upsertFestivals(rows){
  if (!rows.length) return { inserted: 0 };
  const url = buildUrl(SUPABASE_URL, "/rest/v1/festivals", { on_conflict: "contentid" });
  const payload = rows.map(mapFestivalRow);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE}`,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates"
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Supabase upsert failed: ${res.status} ${res.statusText} :: ${t.slice(0,400)}`);
  }
  const data = await res.json().catch(()=>[]);
  return { inserted: Array.isArray(data) ? data.length : 0 };
}

function mapFestivalRow(it){
  return {
    contentid: String(it.contentid),
    title: it.title ?? it.eventname ?? null,
    eventstartdate: it.eventstartdate ?? null,
    eventenddate: it.eventenddate ?? null,
    areacode: it.areacode ?? null,
    sigungucode: it.sigungucode ?? null,
    addr1: it.addr1 ?? null,
    mapx: it.mapx ? Number(it.mapx) : null,
    mapy: it.mapy ? Number(it.mapy) : null,
    firstimage: it.firstimage ?? null,
    createdtime: it.createdtime ?? null,
    modifiedtime: it.modifiedtime ?? null,
    raw: it // keep original for debugging
  };
}

async function harvestArea(area){
  const params = {
    serviceKey: KEY,
    MobileOS: "ETC",
    MobileApp: "HallyuPass",
    _type: "json",
    eventStartDate: startYmd,
    eventEndDate: endYmd,
    areaCode: String(area),
    numOfRows: "30",
    arrange: "C",
    pageNo: "1",
  };

  const collected = [];
  for await (const json of pagedJson({ base: BASE, path: PATH, params, pageParam: "pageNo", rowsParam: "numOfRows", maxPages: 80 })) {
    const items = json?.response?.body?.items?.item ?? [];
    if (Array.isArray(items)) collected.push(...items);
  }
  if (!collected.length) {
    console.warn(`[area ${area}] no items`);
    return { area, items: 0, upserted: 0 };
  }
  const { inserted } = await upsertFestivals(collected);
  return { area, items: collected.length, upserted: inserted };
}

(async ()=>{
  try{
    const results = [];
    for (const a of AREACODES) {
      const r = await harvestArea(a);
      console.log(r);
      results.push(r);
    }
    const totalIn = results.reduce((s,x)=>s+x.items,0);
    const totalUp = results.reduce((s,x)=>s+x.upserted,0);
    console.log({ totalItems: totalIn, totalUpserts: totalUp });
  }catch(e){
    console.error(e.message);
    process.exitCode = 1;
  }
})();
