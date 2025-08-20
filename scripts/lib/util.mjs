// scripts/lib/util.mjs
export function qs(obj = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    p.append(k, String(v));
  }
  return p.toString();
}

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

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function pagedJson({ base, path, params, pageParam='pageNo', rowsParam='numOfRows', maxPages=80 }) {
  const headers = {};
  for (let page = params?.[pageParam] || 1; page <= maxPages; page++) {
    const q = new URLSearchParams({ ...params, [pageParam]: page }).toString();
    const url = `${base}${path}?${q}`;
    const r = await fetch(url, { headers });
    const text = await r.text();
    if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
      console.error('Non-JSON response head:', text.slice(0, 200));
      console.error('URL:', url);
      throw new Error('Response is not JSON');
    }
    yield JSON.parse(text);
  }
}

/** 공공데이터 키 이중 인코딩 방지 */
export function encodeKeyOnce(raw) {
  const key = String(raw || '');
  if (/%[0-9A-Fa-f]{2}/.test(key)) return key;     // 이미 퍼센트 인코딩됨
  try { decodeURIComponent(key); } catch { /* no-op */ }
  return encodeURIComponent(key);
}



// import { buildUrl, getWithPreview, parseJsonOrThrow } from "./http.mjs";

// /** data.go.kr 스타일 JSON 호출(가드 포함) */
// export async function fetchOpenApiJson(base, path, params) {
//   const url = buildUrl(base, path, params);
//   console.log("[GET]", url);
//   const { bodyBuf, info } = await getWithPreview(url);
//   // 인증 실패 시 자주 XML(OpenAPI_ServiceResponse)로 응답
//   if (/OpenAPI_ServiceResponse/i.test(info.head) && /SERVICE_KEY_IS_NOT_REGISTERED/i.test(info.head)) {
//     throw new Error("AuthError:SERVICE_KEY_IS_NOT_REGISTERED (check double-encoding like %252B/%253D and domain/whitelist)");
//   }
//   return parseJsonOrThrow(bodyBuf, info.contentType);
// }

// /** 페이지 처리 제너레이터 */
// export async function* pagedJson({ base, path, params, pageParam="pageNo", rowsParam="numOfRows", maxPages=50 }) {
//   let page = Number(params?.[pageParam] ?? 1);
//   for (let i=0; i<maxPages; i++){
//     const p = { ...params, [pageParam]: String(page) };
//     const json = await fetchOpenApiJson(base, path, p);
//     yield json;
//     const items = json?.response?.body?.items?.item ?? json?.response?.body?.items ?? [];
//     const size = Number(p[rowsParam] ?? 10);
//     if (!Array.isArray(items)) break;
//     if (items.length < size) break;
//     page++;
//   }
// }
