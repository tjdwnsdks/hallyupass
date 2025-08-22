import { createClient } from '@supabase/supabase-js';
import { qs, fetchJson, normalizeKey, todayYmd, addDaysYmd, sleep } from './lib/util.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const DAYS_AHEAD = Number(process.env.DAYS_AHEAD || '60');

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

function pickItems(json) {
  // KCISA 응답 포맷 가변 대응
  // 보편적으로 response.body.items.item 혹은 response.body.items
  const body = json?.response?.body;
  if (!body) return [];
  let items = body?.items?.item ?? body?.items ?? [];
  if (!Array.isArray(items)) items = [items].filter(Boolean);
  return items;
}

async function fetchKCISA(base, params) {
  const url = base + qs(params);
  try {
    const json = await fetchJson(url);
    return { ok: true, url, json };
  } catch (e) {
    return { ok: false, url, err: e };
  }
}

async function run() {
  const rawKey = normalizeKey(process.env.DATA_GO_KR_KCISA || '');
  if (!rawKey) throw new Error('KCISA: empty DATA_GO_KR_KCISA');

  const from = todayYmd();               // YYYYMMDD
  const to   = addDaysYmd(from, DAYS_AHEAD);

  const bases = [
    // data.go.kr 게이트웨이
    'https://apis.data.go.kr/B553457/cultureinfo/period2',
    'https://apis.data.go.kr/B553457/cultureinfo/period',
    // KCISA 직접 엔드포인트(일부 계정에 필요)
    'https://api.kcisa.kr/openapi/service/rest/cultureinfo/period2',
    'https://api.kcisa.kr/openapi/service/rest/cultureinfo/period',
  ];

  const variants = [
    (b) => [b, { serviceKey: rawKey, _type: 'json', from, to, pageNo: 1, numOfRows: 50 }],
    (b) => [b, { serviceKey: rawKey, _type: 'json', from, to, cPage: 1, rows: 50 }],
  ];

  let collected = 0;
  let lastErrs = [];

  for (const base of bases) {
    for (const make of variants) {
      const [b, params] = make(base);
      console.log('[KCISA GET]', b + qs(params));
      const r = await fetchKCISA(b, params);
      if (!r.ok) {
        const head = r.err?.head || '';
        // 대표 에러 라벨링
        if (head.includes('SERVICE_KEY_IS_NOT_REGISTERED_ERROR')) {
          console.log('[KCISA variant failed] kcisa OpenAPI error(30): SERVICE_KEY_IS_NOT_REGISTERED_ERROR');
        } else if (head.includes('Policy Falsified')) {
          console.log('[KCISA variant failed] kcisa SOAP: Policy Falsified');
        } else if (head) {
          console.log('[KCISA variant failed] kcisa non-JSON');
        } else {
          console.log('[KCISA variant failed] http error');
        }
        lastErrs.push({ base: b, head: r.err?.head || '', url: r.err?.url || '' });
        await sleep(800); // 살짝 텀
        continue;
      }

      const items = pickItems(r.json);
      if (items.length === 0) {
        console.log('[KCISA] no items on this variant');
        continue;
      }

      // raw_sources 적재
      const rows = items.map(it => ({
        source: 'kcisa',
        dataset: 'cultureinfo',
        external_id: String(it?.seq ?? it?.id ?? ''), // 항목 키 후보
        lang: null,
        payload: it,
        fetched_at: new Date().toISOString(),
      }));

      const { error } = await sb.from('raw_sources').insert(rows);
      if (error) throw error;

      collected += rows.length;
      console.log(`[KCISA] inserted ${rows.length} rows`);
      // 한 변형에서 성공하면 더 안 바꿔도 됨
      break;
    }
    if (collected > 0) break;
  }

  if (collected === 0) {
    console.log('[KCISA base failed]', 'KCISA: all param variants failed');
    throw new Error('KCISA: no items (키/승인/엔드포인트/기간 확인)');
  }
}

run().catch(e => { throw e; });
