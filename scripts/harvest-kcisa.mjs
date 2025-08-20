import { getDataGoKrKey } from "./lib/env.mjs";
import { buildUrl, getWithPreview } from "./lib/http.mjs";

const KEY = getDataGoKrKey("DATA_GO_KR_KCISA"); // 디코딩 키(+/= 포함)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) throw new Error("Missing Supabase env");

const BASE = "https://apis.data.go.kr/B553457";
const PATH = "cultureinfo/period2";

function ymd(d) { return d.toISOString().slice(0, 10).replace(/-/g, ""); }
const from = ymd(new Date());
const to = ymd(new Date(Date.now() + 30 * 86400000));

async function upsertRawXml(xml, externalId = null) {
  const url = buildUrl(SUPABASE_URL, "/rest/v1/raw_sources",
    { on_conflict: "source,dataset,external_id,lang" });

  const payload = [{
    source: "kcisa",
    dataset: "cultureinfo.period2",
    external_id: externalId || `kcisa-${Date.now()}`, // XML은 항목별 id가 없을 수 있어 페이지 단위 저장
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
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Supabase upsert raw failed: ${res.status} ${res.statusText} :: ${t.slice(0,400)}`);
  }
  await res.json().catch(() => null);
}

(async () => {
  try {
    const params = new URLSearchParams({
      serviceKey: KEY,
      pageNo: "1",
      numOfRows: "50",
      from,
      to
    });
    const url = `${BASE}/${PATH}?${params.toString()}`;

    // XML 그대로 받음
    const { head, info } = await getWithPreview(url);
    if (info.status !== 200) throw new Error(`KCISA http ${info.status} ${info.statusText}`);
    if (!head || !head.trim().startsWith("<")) throw new Error("KCISA non-XML response");

    await upsertRawXml(head, `period2-${from}-${to}-p1`);
    console.log({ saved: true, period: { from, to } });
  } catch (e) {
    console.error(e.message || e);
    process.exitCode = 1;
  }
})();
