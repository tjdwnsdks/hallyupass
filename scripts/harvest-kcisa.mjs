import { createClient } from '@supabase/supabase-js';

// --- 최소 유틸 (외부 util.mjs 의존 제거) ---
function todayYmd() {
  const d = new Date();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}${mm}${dd}`;
}
function addDaysYmd(ymd, n) {
  const y = Number(ymd.slice(0,4)), m = Number(ymd.slice(4,6))-1, d = Number(ymd.slice(6,8));
  const dt = new Date(Date.UTC(y, m, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${dt.getUTCFullYear()}${mm}${dd}`;
}
async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

// --- ENV ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const DAYS_AHEAD = Number(process.env.DAYS_AHEAD || '60');
const KEY = (process.env.DATA_GO_KR_KCISA || '').trim();

// --- Supabase ---
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

// --- 단일 엔드포인트/단일 파라미터 조합 ---
const BASE = 'https://apis.data.go.kr/B553457/cultureinfo/period2';
// ※ KCISA는 YYYYMMDD 권장. pageNo/numOfRows 사용. _type=json 사용.

function buildUrl(from, to, pageNo=1, numOfRows=50) {
  const p = new URLSearchParams({
    serviceKey: KEY, _type: 'json',
    from, to,
    pageNo: String(pageNo),
    numOfRows: String(numOfRows),
  });
  return `${BASE}?${p.toString()}`;
}

function pickItems(json) {
  const body = json?.response?.body;
  if (!body) return [];
  let items = body?.items?.item ?? body?.items ?? [];
  if (!Array.isArray(items)) items = [items].filter(Boolean);
  return items;
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' }});
  const text = await res.text();
  // KCISA 오류는 XML로 오므로 텍스트 헤드로 판별
  if (!res.ok) {
    throw new Error(`http ${res.status} :: ${text.slice(0,200)}`);
  }
  if (text.trim().startsWith('<')) {
    // OpenAPI/SOAP 오류. 헤드 남기고 실패 처리
    const head = text.slice(0, 300);
    const isKeyErr = head.includes('SERVICE_KEY_IS_NOT_REGISTERED_ERROR');
    const isPolicy = head.includes('Policy Falsified');
    const msg = isKeyErr ? 'OpenAPI: SERVICE_KEY_IS_NOT_REGISTERED_ERROR'
              : isPolicy ? 'SOAP: Policy Falsified'
              : 'non-JSON (XML fault)';
    throw new Error(`${msg} :: ${head}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`bad JSON :: ${text.slice(0,200)}`);
  }
}

async function run() {
  if (!KEY) throw new Error('KCISA: DATA_GO_KCISA 키가 비어있습니다');

  // 과거 7일 ~ 향후 7일(먼 미래 요청으로 인한 무응답을 피하기 위해 축소)
  const today = todayYmd();
  const from = addDaysYmd(today, -7);
  const to   = addDaysYmd(today, Math.min(DAYS_AHEAD, 7));

  // 첫 페이지만 시도 → 성공하면 pageNo++ 루프
  let page = 1;
  let totalInserted = 0;

  while (true) {
    const url = buildUrl(from, to, page, 50);
    console.log('[KCISA GET]', url);
    let json;
    try {
      json = await getJson(url);
    } catch (e) {
      // 에러 메시지를 그대로 출력하고 종료
      console.log('[KCISA failed]', String(e));
      break;
    }

    // resultCode/Msg 체크(있으면)
    const header = json?.response?.header;
    const rc = header?.resultCode;
    if (rc && rc !== '00') {
      console.log(`[KCISA header] resultCode=${rc} resultMsg=${header?.resultMsg}`);
      break;
    }

    const items = pickItems(json);
    if (items.length === 0) {
      console.log('[KCISA] no items on this page');
      break;
    }

    const rows = items.map(it => ({
      source: 'kcisa',
      dataset: 'cultureinfo',
      external_id: String(it?.seq ?? it?.id ?? ''),
      lang: null,
      payload: it,
      fetched_at: new Date().toISOString(),
    }));

    const { error } = await sb.from('raw_sources').insert(rows);
    if (error) throw error;

    totalInserted += rows.length;
    console.log(`[KCISA] inserted ${rows.length} rows (page ${page})`);

    // 다음 페이지
    page += 1;
    await sleep(300); // 너무 타이트하지 않게
    // 안전 가드: 10페이지 이상이면 중단(임시)
    if (page > 10) break;
  }

  if (totalInserted === 0) {
    throw new Error('KCISA: 수집된 항목이 없습니다(날짜/키/승인/쿼리를 확인하세요).');
  }
  console.log(`[KCISA] done. total=${totalInserted}`);
}

run().catch(e => { throw e; });
