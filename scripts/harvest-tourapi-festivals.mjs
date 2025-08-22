import { qs, fetchJson, todayYmd, addDaysYmd, sleep } from './lib/util.mjs';
import { upsert } from './lib/sb.mjs';

const KEY  = process.env.DATA_GO_KR_TOURAPI || process.env.DATA_GO_KR_KEY;
const SVC  = process.env.TOURAPI_SVC || 'KorService1'; // 필요 시 KorService2로 변경
const BASE = `https://apis.data.go.kr/B551011/${SVC}`;

const AHEAD = Number(process.env.DAYS_AHEAD || '60');
const AREAS = (process.env.AREACODES || '1').split(',').map(s=>s.trim()).filter(Boolean);
const LANGS = (process.env.TOUR_LANGS || 'ko').split(',').map(s=>s.trim()).filter(Boolean);

function urlSearchFestival({from,to,area,lang,page=1}){
  return `${BASE}/searchFestival2?` + qs({
    serviceKey: KEY, _type:'json', MobileOS:'ETC', MobileApp:'HallyuPass',
    eventStartDate: from, eventEndDate: to, areaCode: area,
    numOfRows: 100, arrange:'C', pageNo: page, lang
  });
}

async function fetchPage(url){
  const res = await fetchJson(url);
  if(!res.ok){
    console.error('Non-JSON head:', res.head.slice(0,200));
    console.error('URL:', res.url);
    throw new Error('TourAPI non-JSON (키/엔드포인트/쿼터 이슈)');
  }
  return res.json?.response?.body?.items?.item || [];
}

function yyyymmddToDateStr8(s){
  if(!s) return null;
  const m = String(s).match(/^(\d{4})(\d{2})(\d{2})$/);
  if(!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

async function run(){
  const from = todayYmd();
  const to   = addDaysYmd(AHEAD);
  const out  = [];

  for(const lang of LANGS){
    for(const area of AREAS){
      console.log(`[FETCH] festivals area=${area} lang=${lang} ${from}-${to} svc=${SVC}`);
      let page=1, retries=0;
      while(true){
        const url = urlSearchFestival({from,to,area,lang,page});
        let items=[];
        try{
          items = await fetchPage(url);
        }catch(e){
          if(++retries<=2){ await sleep(1500); continue; }
          throw e;
        }
        if(!items.length) break;

        for(const it of items){
          const ext = String(it.contentid || `${it.title}|${it.eventstartdate||''}|${it.addr1||''}`);
          out.push({
            source:'tourapi', dataset:'festival', external_id:ext, lang,
            payload: it,
            event_start: yyyymmddToDateStr8(it.eventstartdate),
            event_end:   yyyymmddToDateStr8(it.eventenddate),
            city: it.areacode ? String(it.areacode) : null
          });
        }
        if(items.length<100) break;
        page++; await sleep(300);
      }
      await sleep(300);
    }
  }

  if(out.length){
    const res = await upsert('raw_sources', out);
    console.log('saved festivals:', res.count);
  }else{
    console.log('no festivals rows');
  }
}
run().catch(e=>{ console.error(e); process.exit(1); });
