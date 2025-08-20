// scripts/lib/util.mjs
// 공통 유틸: 쿼리스트링, 날짜, fetch JSON, 키 이중인코딩 방지

export function qs(obj = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    // serviceKey는 이미 퍼센트 인코딩일 수 있으니 그대로 사용
    if (k === 'serviceKey') {
      p.append(k, String(v));
    } else {
      p.append(k, String(v));
    }
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

export async function pagedJson(url, { headers = {}, retries = 2 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    const r = await fetch(url, { headers });
    const ct = r.headers.get('content-type') || '';
    const head = await r.text();
    if (ct.includes('application/json') || head.trim().startsWith('{') || head.trim().startsWith('[')) {
      try { return JSON.parse(head); } catch (e) { lastErr = e; }
    } else {
      // 진단용 로그
      console.error('Non-JSON response head:', head.slice(0, 200));
      throw new Error('Response is not JSON');
    }
    await sleep(400 * (i + 1));
  }
  throw lastErr || new Error('pagedJson failed');
}

/**
 * 공공데이터포털 키 이중 인코딩 방지:
 * - 이미 퍼센트 인코딩 패턴('%AB')이 보이면 그대로 반환
 * - 아니면 encodeURIComponent 한 번만 적용
 */
export function encodeKeyOnce(raw) {
  const key = String(raw || '');
  if (/%[0-9A-Fa-f]{2}/.test(key)) return key;  // 이미 인코딩됨
  try {
    // raw가 디코딩 가능한 경우에도, 원본이 인코딩이 아니면 그대로 인코딩 1회
    decodeURIComponent(key);
  } catch { /* ignore */ }
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
