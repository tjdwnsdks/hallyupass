import { getDataGoKrKey } from "./lib/env.mjs";
import { upsert } from "./lib/sb.mjs";

const KEY = getDataGoKrKey("DATA_GO_KR_TOURAPI");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) throw new Error("Missing Supabase env");

const LANGS = (process.env.TOUR_LANGS ?? "ko,en,ja,chs,cht").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const AREACODES = (process.env.AREACODES ?? "1,2").split(",").map(s => s.trim()).filter(Boolean);

const BASE = "https://apis.data.go.kr/B551011";
const PATH_BY_LANG = {
  ko: "KorService2/searchCourse2",
  en: "EngService2/searchCourse2",
  ja: "JpnService2/searchCourse2",
  chs:"ChsService2/searchCourse2",
  cht:"ChtService2/searchCourse2"
};

function buildUrl(base, path, q = {}) {
  const u = new URL(path.replace(/^\//, ""), base + "/");
  u.search = new URLSearchParams(q).toString();
  return u.toString();
}

async function getJson(url) {
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  const text = await res.text();
  if (!text.trim().startsWith("{")) {
    console.error("Non-JSON head:", text.slice(0,200));
    console.error("URL:", url);
    throw new Error("Response is not JSON");
  }
  return JSON.parse(text);
}

async function harvestLangArea(lang, areaCode) {
  const path = PATH_BY_LANG[lang] || PATH_BY_LANG.en;
  let upserts = 0, itemsTotal = 0;

  for (let pageNo = 1; pageNo <= 40; pageNo++) {
    const url = buildUrl(BASE, path, {
      serviceKey: KEY,
      MobileOS: "ETC",
      MobileApp: "HallyuPass",
      _type: "json",
      areaCode,
      numOfRows: "30",
      arrange: "C",
      pageNo: String(pageNo)
    });

    const j = await getJson(url);
    const items = j?.response?.body?.items?.item || [];
    if (!items.length) break;
    itemsTotal += items.length;

    const rows = items.map(it => ({
      source: "tourapi",
      dataset: "course",
      external_id: String(it.contentid),
      lang,
      payload: it,
      event_start: null,
      event_end: null,
      city: it.addr1 || null
    }));

    const r = await upsert("raw_sources", rows);
    upserts += r.count;

    if (items.length < 30) break;
  }
  return { items: itemsTotal, upserted: upserts };
}

(async () => {
  try {
    const results = [];
    for (const lang of LANGS) for (const area of AREACODES)
      results.push(await harvestLangArea(lang, area));
    const totalItems = results.reduce((s, x) => s + x.items, 0);
    const totalUpserts = results.reduce((s, x) => s + x.upserted, 0);
    console.log({ totalItems, totalUpserts });
  } catch (e) {
    console.error(e.message || e);
    process.exitCode = 1;
  }
})();
