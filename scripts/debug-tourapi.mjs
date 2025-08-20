import { ymd } from "./lib/env.mjs";

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

function variantsFromEnv() {
  const raw = process.env.DATA_GO_KR_TOURAPI || "";
  const out = new Map();
  out.set("raw", raw);
  try { out.set("decoded", decodeURIComponent(raw)); } catch { /* noop */ }
  const base = out.get("decoded") || raw;
  try { out.set("encoded", encodeURIComponent(base)); } catch { /* noop */ }
  return [...out.entries()]; // [ [name, key], ... ]
}

async function tryHealth(key){
  const ping = buildUrl(BASE, "KorService2/areaCode1", {
    serviceKey: key, MobileOS: "ETC", MobileApp: "HallyuPass", _type: "json", numOfRows: "1", pageNo: "1"
  });
  const r = await get(ping);
  if (!/json/i.test(r.ct)) return { ok: false, r };
  try {
    const j = JSON.parse(r.text);
    const code = j?.response?.header?.resultCode;
    return { ok: code === "0000", r, code };
  } catch { return { ok: false, r }; }
}

async function tryFestival(key){
  const fest = buildUrl(BASE, "KorService2/searchFestival2", {
    serviceKey: key, MobileOS: "ETC", MobileApp: "HallyuPass", _type: "json",
    eventStartDate: today, eventEndDate: in30, areaCode: "1", numOfRows: "5", arrange: "C", pageNo: "1"
  });
  const r = await get(fest);
  if (!/json/i.test(r.ct)) return { ok: false, r };
  try {
    const j = JSON.parse(r.text);
    const items = j?.response?.body?.items?.item ?? [];
    return { ok: Array.isArray(items), r, count: Array.isArray(items) ? items.length : 0 };
  } catch { return { ok: false, r }; }
}

(async () => {
  try {
    const variants = variantsFromEnv();
    for (const [name, key] of variants) {
      if (!key) continue;
      console.log(`== Try key variant: ${name} ==`);
      const h = await tryHealth(key);
      console.log("[PING]", h.r.status, h.r.statusText, h.r.ct);
      if (!h.ok) {
        console.log("PING_HEAD:", h.r.text.slice(0, 200));
        continue;
      }
      const f = await tryFestival(key);
      console.log("[FEST]", f.r.status, f.r.statusText, f.r.ct);
      if (!f.ok) {
        console.log("FEST_HEAD:", f.r.text.slice(0, 200));
        continue;
      }
      console.log("items.length =", f.count, "variant=", name);
      return; // 성공
    }
    throw new Error("All key variants failed. Check secret value and API subscription.");
  } catch (e) {
    console.error(e.message || e);
    process.exitCode = 1;
  }
})();
