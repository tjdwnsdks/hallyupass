// scripts/harvest-kcisa.mjs  ← 전체 교체
import { qs, fetchJson, todayYmd, addDaysYmd, sleep } from './lib/util.mjs';
import { upsert } from './lib/sb.mjs';

const KEY   = process.env.DATA_GO_KR_KCISA || '';        // 인코딩 키 (그대로 사용)
const BASE  = 'https://apis.data.go.kr/B553457/cultureInfo/period2';
const AHEAD = Number(process.env.DAYS_AHEAD || '60');

async function fetchPage(from, to, page=1, rows=100){
  const url = `${BASE}?` + qs({
    serviceKey: KEY,           // 키는 qs()에서 URLSearchParams로 인코딩됨
    _type: 'json',             // JSON 강제
    from, to,
    cPage: page,
    rows
  });
  const res = await fetchJson(url);
  // KCISA는 응답 포맷이 가끔 다름: response.body.items | items | item
  const items = res?.response?.body?.items
             ?? res?.response?.body?.item
             ?? res?.items ?? [];
  return Array.isArray(items) ? items : (items ? [items] : []);
}

async function run(){
  const from = todayYmd();
  const to   = addDaysYmd(AHEAD);
  const out  = [];

  for(let page=1; page<=50; page++){
    const items = await fetchPage(from, to, page, 100);
    if(!items.length) break;

    for(const it of items){
      const ext = String(it?.cul_id ?? it?.id ?? `${it?.title ?? ''}|${it?.startDate ?? ''}|${it?.place ?? ''}`);
      out.push({
        source: 'kcisa',
        dataset: 'performance',
        external_id: ext,
        lang: 'ko',
        payload: it,
        event_start: (it?.startDate ?? '').slice(0,10) || null,
        event_end: (it?.endDate ?? '').slice(0,10) || null,
        city: it?.place ?? null
      });
    }
    if(items.length < 100) break;
    await sleep(150); // 레이트리밋 완화
  }

  if(out.length){
    const r = await upsert('raw_sources', out);
    console.log('kcisa saved:', r.count);
  }else{
    console.log('kcisa: no items');
  }
}

run().catch(e=>{ console.error(e); process.exit(1); });
