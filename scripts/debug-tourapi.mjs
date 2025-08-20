import { getDataGoKrKey, ymd } from "./lib/env.mjs";

const KEY = getDataGoKrKey("DATA_GO_KR_TOURAPI");

function buildUrl(base, path, q = {}) {
  const u = new URL(path.replace(/^\//, ""), base + "/");
  u.search = new URLSearchParams(q).toString();
  return u.toString();
}

async function get(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await res.text();
  const ct = res.headers.get("content-type") || "";
  return { ok: res.ok, status: res.status, statusText: res.statusText, ct, text, url };
}

const BASE = "https://apis.data.go.kr/B551011";
const today = ymd(new Date());
const in30  = ymd(new Date(Date.now() + 30*86400000));

(async () => {
  try {
    // 1) 헬스체크: 가장 단순한 JSON 엔드포인트(지역코드 목록)
    const ping = buildUrl(BASE, "KorService2/areaCode1", {
      serviceKey: KEY, MobileOS: "ETC", MobileApp: "HallyuPass", _type: "json", numOfRows: "1", pageNo: "1"
    });
    const hp = await get(ping);
    console.log("[PING]", hp.status, hp.statusText, hp.ct, hp.url);
    if (!hp.ok || !/json/i.test(hp.ct)) {
      console.log("PING_BODY_HEAD:", hp.text.slice(0, 300));
      throw new Error("TourAPI healthcheck failed (key or gateway issue).");
    }

    // 2) 실제 축제 검색 호출
    const fest = buildUrl(BASE, "KorService2/searchFestival2", {
      serviceKey: KEY,
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
    const fr = await get(fest);
    console.log("[GET]", fr.status, fr.statusText, fr.ct, fr.url);
    if (!/json/i.test(fr.ct)) {
      console.log("NonJSON head:", fr.text.slice(0, 300));
      throw new Error(`TourAPI returned non-JSON: ${fr.status} ${fr.statusText}`);
    }
    // JSON 파싱 확인
    const json = JSON.parse(fr.text);
    const items = json?.response?.body?.items?.item ?? [];
    console.log("items.length =", Array.isArray(items) ? items.length : 0);
  } catch (e) {
    console.error(e.message || e);
    process.exitCode = 1;
  }
})();
