import { buildUrl } from "./lib/http.mjs";

// env
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) throw new Error("Missing Supabase env");

async function fetchRawTourapi(limit = 1000) {
  const url = buildUrl(SUPABASE_URL, "/rest/v1/raw_sources", {
    select: "id,source,dataset,external_id,lang,fetched_at,payload_json",
    source: "eq.tourapi",
    dataset: "eq.festivals",
    order: "fetched_at.desc",
    limit: String(limit)
  });
  const res = await fetch(url, {
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE}`
    }
  });
  if (!res.ok) throw new Error(`fetch raw failed ${res.status}`);
  return res.json();
}

function mapTourapiToEvent(row) {
  const it = row.payload_json || {};
  const num = (v) => {
    const s = String(v ?? "").trim();
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
  };
  const date = (s) => {
    const t = String(s ?? "").trim();
    if (!/^\d{8}$/.test(t)) return null;
    // YYYY-MM-DD 형식으로 저장 or DB가 date면 그대로 보냄
    return `${t.slice(0,4)}-${t.slice(4,6)}-${t.slice(6,8)}`;
  };
  return {
    id: String(it.contentid),
    type: "festival",
    title: it.title ?? null,
    start_date: date(it.eventstartdate),
    end_date: date(it.eventenddate),
    area_code: num(it.areacode),
    sigungu_code: num(it.sigungucode),
    addr1: it.addr1 ?? null,
    lon: num(it.mapx),
    lat: num(it.mapy),
    image_url: it.firstimage ?? null,
    src: "tourapi",
    raw_ref: row.id
  };
}

async function upsertEvents(rows) {
  if (!rows.length) return { upserted: 0 };
  const url = buildUrl(SUPABASE_URL, "/rest/v1/events", { on_conflict: "id" });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE}`,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates"
    },
    body: JSON.stringify(rows)
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`upsert events failed: ${res.status} ${res.statusText} :: ${t.slice(0,400)}`);
  }
  const data = await res.json().catch(() => []);
  return { upserted: Array.isArray(data) ? data.length : 0 };
}

(async () => {
  try {
    const rawRows = await fetchRawTourapi(1000);
    const events = rawRows.map(mapTourapiToEvent);
    const { upserted } = await upsertEvents(events);
    console.log({ raw: rawRows.length, upserted });
  } catch (e) {
    console.error(e.message || e);
    process.exitCode = 1;
  }
})();
