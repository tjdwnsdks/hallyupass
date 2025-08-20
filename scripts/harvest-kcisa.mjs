import { getDataGoKrKey, ymd } from "./lib/env.mjs";

const KEY = getDataGoKrKey("DATA_GO_KR_KCISA");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) throw new Error("Missing Supabase env");

const BASE = "https://apis.data.go.kr/B553457";
const PATH = "cultureinfo/period2";

function buildUrl(base, path, q = {}) {
  const u = new URL(path.replace(/^\//, ""), base + "/");
  u.search = new URLSearchParams(q).toString();
  return u.toString();
}

async function getText(url) {
  const res = await fetch(url, { headers: { "Accept": "*/*" } });
  return { text: await res.text(), status: res.status, statusText: res.statusText };
}

const from = ymd(new Date());
const to   = ymd(new Date(Date.now() + 30 * 86400000));

async function upsertRawXml(xml, extId) {
  const url = buildUrl(SUPABASE_URL, "/rest/v1/raw_sources", {
    on_conflict: "source,dataset,external_id,lang"
  });
  const payload = [{
    source: "kcisa",
    dataset: "cultureinfo.period2",
    external_id: extId,
    lang: "ko",
    payload_xml: xml
  }];
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
  if (!res.ok) throw new Error(`Supabase upsert raw failed: ${res.status} ${res.statusText} :: ${(await res.text()).slice(0,400)}`);
}

(async () => {
  try {
    const url = buildUrl(BASE, PATH, { serviceKey: KEY, pageNo: "1", numOfRows: "50", from, to });
    const { text, status, statusText } = await getText(url);
    if (status !== 200) throw new Error(`KCISA http ${status} ${statusText}`);
    if (!text?.trim().startsWith("<")) throw new Error("KCISA non-XML response");
    const externalId = `period2-${from}-${to}-p1`;
    await upsertRawXml(text, externalId);
    console.log({ saved: true, period: { from, to }, externalId });
  } catch (e) {
    console.error(e.message || e);
    process.exitCode = 1;
  }
})();
