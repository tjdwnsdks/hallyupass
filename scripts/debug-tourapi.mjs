import { ymd } from "./lib/env.mjs";

function buildUrl(base, path, q = {}) {
  const u = new URL(path.replace(/^\//, ""), base + "/");
  u.search = new URLSearchParams(q).toString();
  return u.toString();
}
async function req(url) {
  const res = await fetch(url, { headers: { Accept: "*/*" } });
  const text = await res.text();
  const ct = res.headers.get("content-type") || "";
  return { ok: res.ok, status: res.status, statusText: res.statusText, ct, text, url };
}

const BASES = ["https://apis.data.go.kr/B551011"]; // KorService2 전용만 검사
const PATHS = ["KorService2/searchFestival2"];
const today = ymd(new Date());
const in30  = ymd(new Date(Date.now() + 30*86400000));

function keyVariants() {
  const raw = process.env.DATA_GO_KR_TOURAPI || "";
  const out = new Map();
  out.set("raw", raw);
  try { out.set("decoded", decodeURIComponent(raw)); } catch {}
  const base = out.get("decoded") || raw;
  try { out.set("encoded", encodeURIComponent(base)); } catch {}
  return [...out.entries()];
}

(async () => {
  let success = false;
  for (const [kname, key] of keyVariants()) {
    if (!key) continue;
    for (const base of BASES) {
      for (const path of PATHS) {
        const url = buildUrl(base, path, {
          serviceKey: key,
          MobileOS: "ETC",
          MobileApp: "HallyuPass",
          _type: "json",
          eventStartDate: today,
          eventEndDate: in30,
          areaCode: "1",
          numOfRows: "5",
          arrange: "C",
          pageNo: "1"
        });
        const r = await req(url);
        console.log(`[TRY] key=${kname} ${r.status} ${r.statusText} ${r.ct} ${url}`);
        if (!/json/i.test(r.ct)) { console.log("HEAD:", r.text.slice(0,180)); continue; }
        try {
          const j = JSON.parse(r.text);
          const code = j?.response?.header?.resultCode;
          const items = j?.response?.body?.items?.item ?? [];
          console.log("resultCode=", code, "items.length=", Array.isArray(items) ? items.length : 0);
          if (code === "0000") { console.log("OK variant →", { keyVariant: kname, base, path }); success = true; break; }
        } catch { /* ignore */ }
      }
      if (success) break;
    }
    if (success) break;
  }
  if (!success) {
    console.log("No working combination. Verify Secret holds the **TourAPI 디코딩키** of KorService2.");
    // 실패여도 워크플로는 계속(continue-on-error로 처리)
    process.exitCode = 1;
  }
})();
