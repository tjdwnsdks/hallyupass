// scripts/harvest-tourapi-festivals.mjs
import { qs, fetchJson, todayYmd, addDaysYmd, sleep } from './lib/util.mjs';
import { createClient } from '@supabase/supabase-js';

// --- 환경
const KEY   = process.env.DATA_GO_KR_TOURAPI || process.env.DATA_GO_KR_KEY || '';
const AHEAD = Number(process.env.DAYS_AHEAD || '60');
const AREAS = (process.env.AREACODES || '1,2,3,4,5,6,7,8,31,32,33,34,35,36,37,38,39').split(',').map(s=>s.trim());
const LANGS = (process.env.TOUR_LANGS || 'ko,en').split(',').map(s=>s.trim());

// TourAPI 베이스(고정)
const BASE = 'https://apis.data.go.kr/B551011';

// Supabase
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

// XML 오류 헤드일 때 던지기
function isXmlFaultHead(text){ return text.trim().startsWith('<OpenAPI_ServiceResponse') || text.trim().startsWith('<?xml'); }

// KorService1/2 폴백 호출
async function fetchPage(params){
  const common = {
    serviceKey: KEY,
    _type: 'json',
    MobileOS: 'ETC',
    MobileApp: 'HallyuPass',
    arrange: 'C',
    numOfRows: 100,
    pageNo: params.pageNo || 1,
  };

  // KorService2 -> searchFestival2 (lang 지원)
  const url2 = `${BASE}/KorService2/searchFestival2?` + qs({
    ...common,
    eventStartDate: params.start,
    eventEndDate: params.end,
    areaCode: params.area,
    lang: params.lang,
  });

  // KorService1 -> searchFestival1 (lang 없음)
  const url1 = `${BASE}/KorService1/searchFestival1?` + qs({
    ...common,
    eventStartDate: params.start,
    eventEndDate: params.end,
    areaCode: params.area,
  });

  // KorService1 구형(예외적으로 남아있을 때)
  const url0 = `${BASE}/KorService1/searchFestival?` + qs({
    ...common,
    eventStartDate: params.start,
    eventEndDate: params.end,
    areaCode: params.area,
  });

  const tryUrls = [
    {svc:'KorService2', url:url2, withLang:true},
    {svc:'KorService1', url:url1, withLang:false},
    {svc:'KorService1', url:url0, withLang:false}
  ];

  let lastErr = null;
  for(const cand of tryUrls){
    const r = await fetch(cand.url);
    const text = await r.text();

    if(isXmlFaultHead(text)){
      lastErr = { status:r.status, head:text.slice(0,200), url:cand.url };
      continue; // 다음 후보로 폴백
    }
    const j = JSON.parse(text);
    const items = j?.response?.body?.items?.item || [];
    const total = j?.response?.body?.totalCount ?? items.length ?? 0;
    return { ok:true, items, total, svc:cand.svc, usedUrl:cand.url };
  }
  // 모두 실패
  const e = new Error('TourAPI non-JSON');
  e.last = lastErr;
  throw e;
}

// raw_sources 업서트
async function upsertRaw(rows){
  if(!rows.length) return;
  const payload = rows.map(r=>({
    source: 'tourapi',
    dataset: 'festival',
    external_id: String(r.contentid),
    lang: r._lang || null,
    payload: r,
    event_start: r.eventstartdate ? r.eventstartdate.replaceAll('-','').slice(0,8) : null,
    event_end:   r.eventenddate   ? r.eventenddate.replaceAll('-','').slice(0,8) : null,
    city: r.addr1 || null,
    fetched_at: new Date().toISOString()
  }));
  const { error } = await sb.from('raw_sources').upsert(payload, {
    onConflict: 'source,dataset,external_id,lang'
  });
  if(error){
    console.error('raw_sources upsert error:', error);
    throw error;
  }
}

async function run(){
  const start = todayYmd();
  const end   = addDaysYmd(AHEAD);

  for(const area of AREAS){
    for(const lang of LANGS){
      // KorService1은 lang 파라미터가 무의미하므로 ko 외엔 건너뜀
      const effLang = lang;
      const tryLang = (l)=> (l==='ko');

      console.log(`[FETCH] festivals area=${area} lang=${lang} ${start}-${end}`);
      let page = 1, acc = [];
      while(true){
        try{
          // KorService2는 lang 그대로, KorService1로 폴백 시 내부에서 lang 미포함 URL을 자동 시도함
          const useLang = lang;
          const { ok, items, total, svc, usedUrl } = await fetchPage({ start, end, area, pageNo: page, lang: useLang });
          if(!ok) throw new Error('not ok');
          items.forEach(it => it._lang = (svc==='KorService2' ? effLang : 'ko'));
          acc.push(...items);

          if(items.length < 100){ // 마지막 페이지
            console.log(`  area=${area} lang=${lang} svc=${svc} total~=${acc.length} done`);
            break;
          }
          page += 1;
          await sleep(120); // Rate-limit 완화
        }catch(e){
          if(e.last){
            console.error('Non-JSON head:', e.last.head);
            console.error('URL:', e.last.url);
          }
          throw e;
        }
      }
      if(acc.length) await upsertRaw(acc);
      await sleep(200); // 다음 lang/area로
    }
    await sleep(500);
  }
}

run().catch(e=>{ console.error(e); process.exit(1); });
