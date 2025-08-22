// scripts/harvest-kcisa.mjs
import { qs, fetchJson, todayYmd, addDaysYmd, sleep, normalizeKey } from './lib/util.mjs';
import { upsert } from './lib/sb.mjs';

const KEY   = normalizeKey(process.env.DATA_GO_KR_KCISA || '');
const AHEAD = Number(process.env.DAYS_AHEAD || '60');

// KCISA는 반드시 소문자 path: cultureinfo
const BASES = [
  'https://apis.data.go.kr/B553457/cultureinfo/period2',
  'https://api.kcisa.kr/openapi/service/rest/cultureinfo/period2',
];

async function fetchPage(base, { from, to, pageNo }) {
  const url = `${base}?` + qs({ serviceKey: KEY, _type: 'json', from, to, cPage: pageNo, rows: 50 });
  const j = await fetchJson(url, { label: 'kcisa' });
  const items = j?.response?.body?.items?.item ?? j?.response?.body?.item ?? j?.items?.item ?? j?.items ?? [];
  return Array.isArray(items) ? items : (items ? [items] : []);
}

async function run() {
  const from = todayYmd();
  const to   = addDaysYmd(AHEAD);
  const out  = [];

  for (const base of BASES) {
    console.log(`[KCISA] try base=${base}`);
    try {
      for (let p = 1; p <= 30; p++) {
        const items = await fetchPage(base, { from, to, pageNo: p });
        if (!items.length) break;

        for (const it of items) {
          const ext = String(it.cul_id ?? it.id ?? `${it.title ?? ''}|${it.startDate ?? ''}|${it.place ?? ''}`);
          out.push({
            source: 'kcisa',
            dataset: 'performance',
            external_id: ext,
            lang: 'ko',
            payload: it,
            event_start: (it.startDate ?? '').slice(0, 10) || null,
            event_end:   (it.endDate   ?? '').slice(0, 10) || null,
            city: it.place ?? null,
          });
        }
        if (items.length < 50) break;
        await sleep(300);
      }
      if (out.length) break; // 한 베이스 성공 시 종료
    } catch (e) {
      console.warn(`[KCISA] base failed: ${e.message}`);
    }
  }

  if (!out.length) throw new Error('KCISA: no items (키/승인/쿼터/엔드포인트 확인 필요)');

  const r = await upsert('raw_sources', out);
  console.log('kcisa saved:', r.count);
}

run().catch(e => { console.error(e); process.exit(1); });
