// scripts/transform-events.mjs
// raw_sources(tourapi/festivals) → events 업서트

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) throw new Error("Missing Supabase env");

// ---- helpers ----
function buildUrl(base, path, q = {}) {
  const u = new URL(path.replace(/^\//, ""), base.endsWith("/") ? base : base + "/");
  u.search = new URLSearchParams(q).toString();
  return u.toString();
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} :: ${url}`);
  return res.json();
}

async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} :: ${(t || "").slice(0, 400)}`);
  }
  return res.json().catch(() => []);
}

function num(v) {
  const s = String(v ?? "").trim();
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}
function ymdToDate(s) {
  const t = String(s ?? "").trim();
  return /^\d{8}$/.test(t) ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : null;
}
function chunk(arr, n = 100) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// ---- fetch raw ----
async function fetchRawTourapi(limit = 2000) {
  const url = buildUrl(SUPABASE_URL, "rest/v1/raw_sources", {
    select: "id,source,dataset,external_id,lang,fetched_at,payload_json",
    source: "eq.tourapi",
    dataset: "eq.festivals",
    order: "fetched_at.desc",
    limit: String(limit),
  });
  return getJson(url, {
    apikey: SUPABASE_SERVICE_ROLE,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  });
}

// ---- map → events row (보수적 컬럼만 사용: id,type,title,start_date,end_date,address,lat,lng,image) ----
function mapToEvent(row) {
  const it = row?.payload_json ?? {};
  return {
    id: String(it?.contentid ?? row?.external_id ?? ""),
    type: "festival",
    title: it?.title ?? null,
    start_date: ymdToDate(it?.eventstartdate),
    end_date: ymdToDate(it?.eventenddate),
    address: it?.addr1 ?? null,
    lat: num(it?.mapy),
    lng: num(it?.mapx),
    image: it?.firstimage ?? null,
  };
}

// ---- upsert events ----
async function upsertEvents(rows) {
  if (!rows.length) return { upserted: 0 };
  const url = buildUrl(SUPABASE_URL, "rest/v1/events", { on_conflict: "id" });
  let total = 0;
  for (const batch of chunk(rows, 200)) {
    const data = await postJson(
      url,
      batch,
      {
        apikey: SUPABASE_SERVICE_ROLE,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
        Prefer: "resolution=merge-duplicates,return=representation",
      }
    );
    total += Array.isArray(data) ? data.length : 0;
  }
  return { upserted: total };
}

// ---- main ----
(async () => {
  try {
    const rawRows = await fetchRawTourapi(2000);
    const events = rawRows
      .map(mapToEvent)
      .filter(r => r.id && r.type === "festival"); // 최소 조건
    const { upserted } = await upsertEvents(events);
    console.log({ raw: rawRows.length, mapped: events.length, upserted });
  } catch (e) {
    console.error(e.message || e);
    process.exitCode = 1;
  }
})();
