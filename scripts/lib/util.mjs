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
export const sleep = ms => new Promise(r => setTimeout(r, ms));

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

/** JSON 우선, XML 에러(OpenAPI/SOAP)는 구조화해서 throw */
export async function fetchJsonSmart(url, { label = '' } = {}) {
  const r = await fetch(url);
  const txt = await r.text();

  // TourAPI XML 에러
  if (txt.includes('<OpenAPI_ServiceResponse')) {
    const msg = (txt.match(/<returnAuthMsg>([^<]+)</) || [,''])[1];
    const code = (txt.match(/<returnReasonCode>(\d+)</) || [,''])[1];
    const e = new Error(`${label||'fetch'} XML error${code?`(${code})`:''}${msg?`: ${msg}`:''}`);
    e.name = 'OpenAPIError';
    e.status = r.status; e.code = code; e.authMsg = msg; e.head = txt.slice(0,400); e.url = url;
    throw e;
  }
  // KCISA SOAP Fault
  if (txt.includes('<soapenv:Envelope')) {
    const fault = (txt.match(/<faultstring>([^<]+)</) || [,''])[1] || 'SOAP Fault';
    const e = new Error(`${label||'fetch'} SOAP: ${fault}`);
    e.name = 'SoapFault';
    e.status = r.status; e.head = txt.slice(0,400); e.url = url;
    throw e;
  }
  try {
    return JSON.parse(txt);
  } catch {
    const e = new Error(`${label||'fetch'} non-JSON`);
    e.name = 'NonJson';
    e.status = r.status; e.head = txt.slice(0,400); e.url = url;
    throw e;
  }
}
