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

const BASE = "https://apis.data.go.kr/B551011";
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

const services = [
  "KorService2/areaCode1",
  "KorService1/areaCode1",
  "KorService/areaCode1",
  "KorService2/areaCode",
  "KorService1/areaCode",
];

async function tryPing(svc, key) {
  const url = buildUrl(BASE, svc, {
    serviceKey: key, MobileOS: "ETC", MobileApp: "HallyuPass", _type: "json", numOfRows: "1", pageNo: "1"
  });
  const r = await req(url);
  if (!/json/i.test(r.ct)) return { ok:false, r };
  try {
    const j = JSON.parse(r.text);
    const code = j?.response?.header?.resultCode;
    return { ok: code === "0000", r, code };
  } catch { return { ok:false, r }; }
}

(async () => {
  try {
    for (const [kname, key] of keyVariants()) {
      if (!key) continue;
      for (const svc of services) {
        console.log(`== key:${kname} path:${svc}`);
        const p = await tryPing(svc, key);
        console.log("[PING]", p.r.status, p.r.statusText, p.ct);
        if (!p.ok) { console.log("HEAD:", p.r.text.slice(0, 200)); continue; }
        console.log("OK variant →", { keyVariant: kname, svc });
        return;
      }
    }
    throw new Error("No working key/path. 데이터포털 TourAPI 디코딩키와 Secret 값을 재확인하세요.");
  } catch (e) {
    console.error(e.message || e);
    process.exitCode = 1;
  }
})();
