import { getDataGoKrKey, ymd } from "./lib/env.mjs";
import { buildUrl, getJson } from "./lib/http.mjs";
import { pagedJson } from "./lib/util.mjs";

const KEY = getDataGoKrKey("DATA_GO_KR_TOURAPI");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) throw new Error("Missing Supabase env");

const DAYS_AHEAD = Number(process.env.DAYS_AHEAD ?? 60);
const startYmd = ymd(new Date());
const endYmd = ymd(new Date(Date.now() + DAYS_AHEAD * 86400000));
const AREACODES = (process.env.AREACODES ?? "1,2").split(",").map(s => s.trim()).filter(Boolean);

const BASE = "https://apis.data.go.kr/B551011";
const PATH = "KorService2/searchFestival2";

async function upsertRaw(items) {
  if (!items.length) return { inserted: 0 };
  const url = buildUrl(SUPABASE_URL, "/rest/v1/raw_sources",
    { on_conflict: "source,dataset,external_id,lang" });

  const payload = items.map(it => ({
    source: "tourapi",
    dataset: "festivals",
    external_id: String(it.contentid),
    lang: "ko",              // 다국어 수집 시 루프에서 언어별로 세팅
    payload_json: it
  }));

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
    throw new Error(`Supabase upsert raw failed: ${res.status} ${res.statusText} :: ${t.slice(0,400)}`);
  }
  const data = await res.json().catch(() => []);
  return { inserted: Array.isArray(data) ? data.length : 0 };
}

async function harvestArea(area) {
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
    pageNo: "1"
  };

  const collected = [];
  for await (const json of pagedJson({ base: BASE, path: PATH, params, pageParam: "pageNo", rowsParam: "numOfRows", maxPages: 80 })) {
    const items = json?.response?.body?.items?.item ?? [];
    if (Array.isArray(items)) collected.push(...items);
  }

  if (!collected.length) return { area, items: 0, upserted: 0 };
  const { inserted } = await upsertRaw(collected);
  return { area, items: collected.length, upserted: inserted };
}

(async () => {
  try {
    const results = [];
    for (const a of AREACODES) {
      const r = await harvestArea(a);
      console.log(r);
      results.push(r);
    }
    const totalItems = results.reduce((s, x) => s + x.items, 0);
    const totalUpserts = results.reduce((s, x) => s + x.upserted, 0);
    console.log({ totalItems, totalUpserts });
  } catch (e) {
    console.error(e.message || e);
    process.exitCode = 1;
  }
})();
