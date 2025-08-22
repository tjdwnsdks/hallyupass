import { createClient } from '@supabase/supabase-js';
import { normalizeKey, todayYmd, addDaysYmd, sleep } from './lib/util.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const DAYS_AHEAD = Number(process.env.DAYS_AHEAD || '60');

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

function ymdDash(ymd) {
  return `${ymd.slice(0,4)}-${ymd.slice(4,6)}-${ymd.slice(6,8)}`;
}

function pickItems(json) {
  const body = json?.response?.body;
  if (!body) return [];
  let items = body?.items?.item ?? body?.items ?? [];
  if (!Array.isArray(items)) items = [items].filter(Boolean);
  return items;
}

async function getText(url) {
  const res = await fetch(url);
  const text = await res.text();
  return { ok: res.ok, status: res.status, url, text, head: text.slice(0, 400) };
}

function buildQuery(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.append(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function run() {
  const rawKey = normalizeKey(process.env.DATA_GO_KR_KCISA || '');
  if (!rawKey) throw new Error('KCISA: empty DATA_GO_KR_KCISA');

  const fromY = todayYmd();
  const toY   = addDaysYmd(fromY, DAYS_AHEAD);
  const fromD = ymdDash(fromY);
  const toD   = ymdDash(toY);

  const bases = [
    // data.go.kr 게이트웨이 (정식)
    'https://apis.data.go.kr/B553457/cultureinfo/period2',
    'https://apis.data.go.kr/B553457/cultureinfo/period',
    // KCISA 직접 엔드포인트 (계정/승인에 따라 이쪽만 열려있는 경우가 있음)
    'https://api.kcisa.kr/openapi/service/rest/cultureinfo/period2',
    'https://api.kcisa.kr/openapi/service/rest/cultureinfo/period',
  ];

  // 파라미터 조합(페이지명/리밋명, 타입키)
  const paramVariants = [
    (f,t) => ({ serviceKey: rawKey, _type: 'json', from: f, to: t, pageNo: 1, numOfRows: 50 }),
    (f,t) => ({ serviceKey: rawKey, _type: 'json', from: f, to: t, cPage: 1, rows: 50 }),
    (f,t) => ({ serviceKey: rawKey, resultType: 'json', from: f, to: t, pageNo: 1, numOfRows: 50 }),
    (f,t) => ({ serviceKey: rawKey, resultType: 'json', from: f, to: t, cPage: 1, rows: 50 }),
    (f,t) => ({ serviceKey: rawKey, from: f, to: t, pageNo: 1, numOfRows: 50 }), // 타입키 없이
    (f,t) => ({ serviceKey: rawKey, from: f, to: t, cPage: 1, rows: 50 }),
  ];

  // 날짜 포맷(YYYYMMDD / YYYY-MM-DD)
  const dateVariants = [
    { from: fromY, to: toY },
    { from: fromD, to: toD },
  ];

  let collected = 0;
  const tried = [];

  for (const base of bases) {
    for (const dv of dateVariants) {
      for (const make of paramVariants) {
        const params = make(dv.from, dv.to);
        const url = base + buildQuery(params);

        console.log('[KCISA GET]', url);
        const r = await getText(url);
        tried.push({ base, status: r.status, head: r.head });

        if (!r.ok) {
          console.log('[KCISA variant failed] http error', r.status);
          await sleep(500);
          continue;
        }

        if (r.text.trim().startsWith('<')) {
          // OpenAPI 에러/ SOAP Fault 등
          if (r.head.includes('SERVICE_KEY_IS_NOT_REGISTERED_ERROR')) {
            console.log('[KCISA variant failed] OpenAPI error(30): SERVICE_KEY_IS_NOT_REGISTERED_ERROR');
          } else if (r.head.includes('Policy Falsified')) {
            console.log('[KCISA variant failed] SOAP: Policy Falsified');
          } else {
            console.log('[KCISA variant failed] non-JSON');
          }
          await sleep(500);
          continue;
        }

        let json;
        try {
          json = JSON.parse(r.text);
        } catch {
          console.log('[KCISA variant failed] bad JSON:', r.head);
          await sleep(500);
          continue;
        }

        const items = pickItems(json);
        if (items.length === 0) {
          console.log('[KCISA] no items in this variant (json parsed ok)');
          await sleep(300);
          continue;
        }

        // 적재
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

        collected += rows.length;
        console.log(`[KCISA] inserted ${rows.length} rows`);
        break; // 이 변형에서 성공했으면 같은 base에서 추가 변형 불필요
      }
      if (collected > 0) break;
    }
    if (collected > 0) break;
  }

  if (collected === 0) {
    // 마지막 시도 헤드 1~2개만 요약 출력(로그 가독성)
    const lastHeads = tried.slice(-2).map(t => `base=${t.base} status=${t.status}\n${t.head}`).join('\n---\n');
    console.log('[KCISA base failed] 어떤 응답이 왔는지 샘플:\n' + lastHeads);
    throw new Error('KCISA: no items (키/승인/엔드포인트/기간 확인)');
  }
}

run().catch(e => { throw e; });
