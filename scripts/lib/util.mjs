// scripts/lib/util.mjs
// 공통 유틸: 쿼리스트링, 날짜, JSON fetch, 키 이중 인코딩 방지

/** 객체 -> querystring(string or object 모두 허용) */
export function qs(baseOrObj, obj) {
  if (typeof baseOrObj === 'string') {
    const u = new URL(baseOrObj);
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(obj || {})) {
      if (v === undefined || v === null || v === '') continue;
      params.append(k, String(v));
    }
    u.search = params.toString();
    return u.toString();
  }
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(baseOrObj || {})) {
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

/** 안전한 경로 접근 a.b.c */
function getByPath(obj, path) {
  if (!path) return obj;
  return String(path).split('.').reduce(
    (acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined),
    obj
  );
}

/** 페이지네이션 helper: urlBuilder(pageNo) 형태도 지원 */
export async function* pagedJson(urlOrBuilder, itemsPath, { maxPages = 100 } = {}) {
  for (let page = 1; page <= maxPages; page++) {
    const url = typeof urlOrBuilder === 'function' ? urlOrBuilder(page) : urlOrBuilder;
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
    yield itemsPath ? getByPath(data, itemsPath) ?? [] : data;
    // 종료 조건은 호출 측에서 items 길이로 판단
  }
}

/** 공공데이터포털 키 이중 인코딩 방지 */
export function encodeKeyOnce(raw) {
  const key = String(raw ?? '');
  // 이미 퍼센트 인코딩 흔적이 있으면 그대로 사용
  if (/%[0-9A-Fa-f]{2}/.test(key)) return key;
  try { decodeURIComponent(key); } catch { /* no-op */ }
  return encodeURIComponent(key);
}
