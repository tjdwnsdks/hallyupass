// utils: 날짜, 키 정규화(이중 인코딩 방지), 쿼리스트링, JSON 페치, 슬립
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const z2 = (n) => String(n).padStart(2, '0');

export function todayYmd() {
  const d = new Date(); // UTC 기준
  return `${d.getUTCFullYear()}${z2(d.getUTCMonth()+1)}${z2(d.getUTCDate())}`;
}

export function addDaysYmd(ymd, days) {
  const y = +ymd.slice(0,4), m = +ymd.slice(4,6)-1, d = +ymd.slice(6,8);
  const dt = new Date(Date.UTC(y, m, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}${z2(dt.getUTCMonth()+1)}${z2(dt.getUTCDate())}`;
}

// 환경변수에 인코딩 키가 들어와도 한 번만 인코딩되도록 정규화
export function normalizeKey(k) {
  if (!k) return '';
  try { return decodeURIComponent(k); } catch { return k; } // 이미 디코딩 상태면 그대로
}

export function qs(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') p.append(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

// XML/에러본문을 감지해서 유용한 헤드 스니펫을 포함해 던짐
export async function fetchJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  const head = text.slice(0, 200);
  if (!res.ok) {
    throw Object.assign(new Error('http error'), { status: res.status, head, url });
  }
  if (text.trim().startsWith('<')) { // OpenAPI XML, SOAP Fault 등
    throw Object.assign(new Error('non-JSON'), { status: res.status, head, url });
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw Object.assign(new Error('bad JSON'), { status: res.status, head, url });
  }
}
