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

// 프로토콜/서비스 경로 조합을 모두 시도
const bases = ["https://apis.data.go.kr/B551011", "http://apis.data.go.kr/B551011"];
const services = [
  "KorService2/areaCode1",
  "KorService1/areaCode1",
  "KorService/areaCode1",
  "KorService2/areaCode",
  "KorService1/areaCode",
];

async function tryPing(base, svc, key) {
  const url = buildUrl(base, svc, {
    serviceKey: key, MobileOS: "ETC", MobileApp: "HallyuPass", _type: "json", numOfRows: "1", pageNo: "1"
  });
  const r = await req(url);
  console.log("[PING]", r.status, r.statusText, r.ct, url);
  if (!/json/i.test(r.ct)) return { ok:false, r };
  try {
    const j = JSON.parse(r.text);
    const code = j?.response?.header?.resultCode;
    return { ok: code === "0000", r, code };
  } catch { return { ok:false, r }; }
}

(async () => {
  try {
    let found = null;
    for (const [kname, key] of keyVariants()) {
      if (!key) continue;
      for (const base of bases) {
        for (const svc of services) {
          console.log(`== try key:${kname} base:${base.replace('https://','').replace('http://','')} path:${svc}`);
          const p = await tryPing(base, svc, key);
          if (p.ok) { found = { kname, base, svc }; break; }
          console.log("HEAD:", p.r.text.slice(0, 200));
        }
        if (found) break;
      }
      if (found) break;
    }
    if (!found) throw new Error("No working key/path/protocol. TourAPI 승인/키 값/경로를 재확인하세요.");
    console.log("OK variant →", found);

    // 필요 시 실제 축제 호출 예시
    const festUrl = buildUrl(found.base, found.svc.replace("areaCode","searchFestival"), {
      serviceKey: (keyVariants().find(([n])=>n===found.kname) || keyVariants()[0])[1],
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
    const fr = await req(festUrl);
    console.log("[FEST]", fr.status, fr.statusText, fr.ct, festUrl);
    if (/json/i.test(fr.ct)) {
      const j = JSON.parse(fr.text);
      const items = j?.response?.body?.items?.item ?? [];
      console.log("items.length =", Array.isArray(items) ? items.length : 0);
    } else {
      console.log("FEST_HEAD:", fr.text.slice(0, 200));
    }
  } catch (e) {
    console.error(e.message || e);
    process.exitCode = 1;
  }
})();
