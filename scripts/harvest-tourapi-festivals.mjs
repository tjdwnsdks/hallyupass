// scripts/harvest-tourapi-festivals.mjs  ← 전체 교체
import { qs, fetchJson, todayYmd, sleep } from './lib/util.mjs';
import { createClient } from '@supabase/supabase-js';

const KEY   = process.env.DATA_GO_KR_TOURAPI || process.env.DATA_GO_KR_KEY;
const AREAS = (process.env.AREACODES || '1,2,3,4,5,6,7,8,31,32,33,34,35,36,37,38,39').split(',').map(s=>s.trim());
const LANGS = (process.env.TOUR_LANGS || 'ko,en').split(',').map(s=>s.trim());
const PER_PAGE = 100;
const AHEAD = Number(process.env.DAYS_AHEAD || '60');
const SVC = { ko:'KorService2', en:'EngService2', ja:'JpnService2', chs:'ChsService2', cht:'ChtService2' };

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

// YYYYMMDD 문자열에 days 더하기(UTC)
function addDaysYmd(baseYmd, days){
  const y = Number(baseYmd.slice(0,4));
  const m = Number(baseYmd.slice(4,6)) - 1;
  const d = Number(baseYmd.slice(6,8));
  const dt = new Date(Date.UTC(y,m,d));
  dt.setUTCDate(dt.getUTCDate() + Number(days||0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth()+1).padStart(2,'0');
  const dd = String(dt.getUTCDate()).padStart(2,'0');
  return `${yy}${mm}${dd}`;
}

function baseParams(){
  return { serviceKey:KEY, _type:'json', MobileOS:'ETC', MobileApp:'HallyuPass', numOfRows:PER_PAGE, arrange:'C', pageNo:1 };
}

async function upsertRaw(rows){
  if(!rows.length) return;
  const { error } = await sb.from('raw_sources').upsert(rows, { onConflict:'source,dataset,external_id,lang' });
  if(error) throw new Error(`upsert raw_sources error: ${error.message}`);
}

async function fetchAreaLang(area, lang, fromYmd, toYmd){
  const svc = SVC[lang] || SVC.ko;
  const base = `https://apis.data.go.kr/B551011/${svc}/searchFestival2`;
  console.log(`[FETCH] festivals area=${area} lang=${lang} ${fromYmd}-${toYmd} svc=${svc}`);
  let page=1, saved=0;

  while(true){
    const url = `${base}?` + qs({ ...baseParams(), eventStartDate:fromYmd, eventEndDate:toYmd, areaCode:area, pageNo:page });
    let j;
    try{
      j = await fetchJson(url, { minDelayMs:900, retry:4 });
    }catch(e){
      const head = e?.meta?.head || '';
      if(/LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR|22/.test(head)){
        console.warn('RATE LIMIT. sleep 60s');
        await sleep(60000);
        continue;
      }
      throw e;
    }

    const items = j?.response?.body?.items?.item || [];
    if(items.length===0) break;

    const rows = items.map(it=>({
      source:'tourapi',
      dataset:'festival',
      external_id:String(it.contentid || it.contentId),
      lang,
      payload:it,
      fetched_at:new Date().toISOString(),
      event_start: it.eventstartdate ? String(it.eventstartdate).slice(0,8) : null,
      event_end:   it.eventenddate   ? String(it.eventenddate).slice(0,8)   : null,
      city: it.sigungucode ? String(it.sigungucode) : null
    }));
    await upsertRaw(rows); saved += rows.length;

    const total = j?.response?.body?.totalCount || 0;
    const maxPages = Math.ceil(total / PER_PAGE) || 1;
    if(page>=maxPages) break;
    page++;
    await sleep(1100);
  }
  return saved;
}

async function run(){
  const FROM = todayYmd();
  const TO   = addDaysYmd(FROM, AHEAD);
  let total=0;
  for(const lang of LANGS){
    for(const area of AREAS){
      const c = await fetchAreaLang(area, lang, FROM, TO);
      total += (c||0);
      await sleep(500);
    }
  }
  console.log('festivals saved:', total);
}
run().catch(e=>{ console.error(e?.meta||e); process.exit(1); });
