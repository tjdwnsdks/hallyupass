// scripts/harvest-kcisa.mjs
import { qs, fetchJsonSmart, todayYmd, addDaysYmd, sleep, normalizeKey } from './lib/util.mjs';
import { upsert } from './lib/sb.mjs';

// 한 번만 인코딩되도록 정규화
const KEY = normalizeKey(process.env.DATA_GO_KR_KCISA || '');
// 두 호스트를 순차 시도 (계정/승인/게이트웨이 차이 대응)
const BASES = [
  'https://api.kcisa.kr/openapi/service/rest/cultureinfo/period2',
  'https://apis.data.go.kr/B553457/cultureInfo/period2'
];

const AHEAD = Number(process.env.DAYS_AHEAD || '60');

async function fetchPage(base, from, to, page = 1, rows = 100) {
  const url = `${base}?` + qs({ serviceKey: KEY, _type:'json', from, to, cPage: page, rows });
  const j = await fetchJsonSmart(url, { label:'kcisa' });
  const items = j?.response?.body?.items ?? j?.response?.body?.item ?? j?.items ?? [];
  return Array.isArray(items) ? items : (items ? [items] : []);
}

async function run() {
  const from = todayYmd();
  const to = addDaysYmd(AHEAD);
  const out = [];

  for (const base of BASES) {
    console.log(`[KCISA] try base=${base}`);
    try {
      for (let page = 1; page <= 50; page++) {
        const items = await fetchPage(base, from, to, page, 100);
        if (!items.length) break;
        for (const it of items) {
          const ext = String(it.cul_id ?? it.id ?? `${it.title ?? ''}|${it.startDate ?? ''}|${it.place ?? ''}`);
          out.push({
            source:'kcisa', dataset:'performance', external_id:ext, lang:'ko', payload:it,
            event_start: (it.startDate ?? '').slice(0,10) || null,
            event_end:   (it.endDate ?? '').slice(0,10)   || null,
            city: it.place ?? null
          });
        }
        if (items.length < 100) break;
        await sleep(150);
      }
      // 한 베이스에서 성공했으면 종료
      if (out.length) break;
    } catch (e) {
      // 첫 베이스 실패 시 다음 베이스로; 둘 다 실패면 throw
      console.warn(`[KCISA] base failed: ${e.message}`);
      continue;
    }
  }

  if (!out.length) throw new Error('KCISA: no items (check key/approval/endpoint)');

  const r = await upsert('raw_sources', out);
  console.log('kcisa saved:', r.count);
}
run().catch(e => { console.error(e); process.exit(1); });
