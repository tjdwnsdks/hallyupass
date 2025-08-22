// scripts/lib/util.mjs
export function todayYmd(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${z(d.getUTCMonth() + 1)}${z(d.getUTCDate())}`;
}
export function addDaysYmd(days = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + Number(days));
  return todayYmd(d);
}
export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export function normalizeKey(k) {
  if (!k) return '';
  try {
    // 이미 인코딩(%2B…)된 키면 decode → 생키로 통일
    const dec = decodeURIComponent(k);
    return dec;
  } catch {
    return k;
  }
}

export function qs(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    p.append(k, String(v));
  }
  return p.toString();
}

export async function fetchJson(url, { label = '' } = {}) {
  const r = await fetch(url);
  const txt = await r.text();
  try {
    return JSON.parse(txt);
  } catch {
    console.error('Non-JSON head:', txt.slice(0, 180));
    console.error('URL:', url);
    const e = new Error((label || 'fetch') + ' non-JSON');
    e.status = r.status;
    e.head = txt.slice(0, 400);
    e.url = url;
    throw e;
  }
}
