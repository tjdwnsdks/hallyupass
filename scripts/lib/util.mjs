// scripts/lib/util.mjs
// 공통 유틸: 쿼리스트링, 날짜, JSON fetch, 키 이중 인코딩 방지

/** 객체 -> querystring */
export function qs(obj = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    p.append(k, String(v));
  }
  return p.toString();
}

/** YYYYMMDD (UTC) */
export function todayYmd(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export function plusDaysYmd(n, base = new Date()) {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + Number(n || 0));
  return todayYmd(d);
}

/** 안전한 중첩 경로 접근: "a.b.c" */
function getByPath(obj, path) {
  if (!path) return obj;
  return String(path)
    .split('.')
    .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

/** 단일 URL JSON fetch. itemsPath 주면 배열 반환 */
export async function pagedJson(url, itemsPath) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await r.text();
  const ct = r.headers.get('content-type') || '';
  const looksJson = ct.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[');

  if (!looksJson) {
    console.error('Non-JSON response head:', text.slice(0, 200));
    console.error('URL:', url);
    throw new Error('Response is not JSON');
  }

  const data = JSON.parse(text);
  if (!itemsPath) return data;

  const items = getByPath(data, itemsPath);
  if (Array.isArray(items)) return items;
  if (items == null) return [];
  return [items];
}

/** 공공데이터포털 키 이중 인코딩 방지 */
export function encodeKeyOnce(raw) {
  const key = String(raw ?? '');
  // 이미 퍼센트 인코딩 패턴이면 그대로 사용
  if (/%[0-9A-Fa-f]{2}/.test(key)) return key;
  try { decodeURIComponent(key); } catch { /* noop */ }
  return encodeURIComponent(key);
}
