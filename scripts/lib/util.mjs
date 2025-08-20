// scripts/lib/util.mjs

/** 객체 → querystring */
export function qs(obj = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    p.append(k, String(v));
  }
  return p.toString();
}

/** YYYYMMDD (UTC) */
export function ymd(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
export const todayYmd = ymd;
export function plusDaysYmd(n, base = new Date()) {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + Number(n || 0));
  return ymd(d);
}

/** 간단 대기 */
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** 페이징 JSON fetch (async generator) */
export async function* pagedJson({
  base, path, params,
  pageParam = 'pageNo',
  rowsParam = 'numOfRows',
  maxPages = 80
}) {
  for (let page = Number(params?.[pageParam] || 1); page <= maxPages; page++) {
    const q = new URLSearchParams({ ...params, [pageParam]: page }).toString();
    const url = `${base}${path}?${q}`;
    const r = await fetch(url);
    const text = await r.text();
    if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
      console.error('Non-JSON response head:', text.slice(0, 200));
      console.error('URL:', url);
      throw new Error('Response is not JSON');
    }
    yield JSON.parse(text);
  }
}

/** 공공데이터포털 키 이중 인코딩 방지 */
export function encodeKeyOnce(raw) {
  const key = String(raw ?? '');
  // 이미 퍼센트 인코딩 형태면 그대로 사용
  if (/%[0-9A-Fa-f]{2}/.test(key)) return key;
  try { decodeURIComponent(key); } catch { /* noop */ }
  return encodeURIComponent(key);
}
