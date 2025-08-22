// scripts/lib/util.mjs
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export function todayYmd(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${z(d.getUTCMonth() + 1)}${z(d.getUTCDate())}`;
}
export function addDaysYmd(days = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + Number(days));
  return todayYmd(d);
}
export function normalizeKey(k) {
  if (!k) return '';
  try { return decodeURIComponent(k); } catch { return k; }
}
export function qs(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    p.append(k, String(v));
  }
  return p.toString();
}

/**
 * 공공데이터포털 공통 fetch:
 * - TourAPI XML 오류(<OpenAPI_ServiceResponse>) 파싱
 * - KCISA SOAP Fault(<soapenv:Envelope>) 파싱
 * - 코드 22(요청제한) 지수백오프 재시도
 */
export async function fetchJson(url, { label = 'fetch', attempt = 1, maxRetries = 6 } = {}) {
  const res = await fetch(url);
  const txt = await res.text();

  // TourAPI XML 에러
  if (txt.includes('<OpenAPI_ServiceResponse')) {
    const msg  = (txt.match(/<returnAuthMsg>([^<]+)</) || [,''])[1];
    const code = (txt.match(/<returnReasonCode>(\d+)</) || [,''])[1];

    if (code === '22' && attempt <= maxRetries) {
      const wait = 15000 * attempt; // 15s, 30s, 45s...
      console.warn(`[${label}] rate-limited(22). retry #${attempt} in ${wait}ms :: ${url}`);
      await sleep(wait);
      return fetchJson(url, { label, attempt: attempt + 1, maxRetries });
    }
    const e = new Error(`${label} OpenAPI error${code ? `(${code})` : ''}${msg ? `: ${msg}` : ''}`);
    e.name = 'OpenAPIError';
    e.status = res.status; e.code = code; e.authMsg = msg; e.head = txt.slice(0, 400); e.url = url;
    throw e;
  }

  // KCISA SOAP Fault
  if (txt.includes('<soapenv:Envelope')) {
    const fault = (txt.match(/<faultstring>([^<]+)</) || [,''])[1] || 'SOAP Fault';
    const e = new Error(`${label} SOAP: ${fault}`);
    e.name = 'SoapFault';
    e.status = res.status; e.head = txt.slice(0, 400); e.url = url;
    throw e;
  }

  try {
    return JSON.parse(txt);
  } catch {
    const e = new Error(`${label} non-JSON`);
    e.name = 'NonJson';
    e.status = res.status; e.head = txt.slice(0, 400); e.url = url;
    throw e;
  }
}
