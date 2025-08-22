// scripts/harvest-tourapi-festivals.mjs
import * as UTIL from './lib/util.mjs';
import { upsert } from './lib/sb.mjs';

// util.mjs와의 호환(fallback)
const qs   = UTIL.qs;
const fetchJson = UTIL.fetchJson;
const sleep = UTIL.sleep ?? (ms=>new Promise(r=>setTimeout(r,ms)));
const todayYmd = UTIL.todayYmd ?? (()=> new Date().toISOString().slice(0,10).replace(/-/g,''));
const addDaysYmd = UTIL.addDaysYmd ?? (n => { const d=new Date(); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10).replace(/-/g,''); });
const normalizeKey = UTIL.normalizeKey ?? (k => {
  try { return encodeURIComponent(decodeURIComponent(k)); } catch { return encodeURIComponent(k); }
});

const KEY   = normalizeKey(process.env.DATA_GO_KR_TOURAPI || process.env.DATA_GO_KR_KEY || '');
const AHEAD = Number(process.env.DAYS_AHEAD || '60');

let LANGS = String(process.env.TOUR_LANGS || 'ko,en').split(',').map(s=>s.trim()).filter(Boolean);
let AREAS = String(process.env.AREACODES  || '1,2,3,4,5,6,7,8,31,32,33,34,35,36,37,38,39').split(',').map(s=>s.trim()).filter(Boolean);

// 테스트 축소(원하면 env로 제한)
const MAX_LANGS = Number(process.env.MAX_LANGS || '0');
const MAX_AREAS = Number(process.env.MAX_AREAS || '0');
if (MAX_LANGS > 0) LANGS = LANGS.slice(0, MAX_LANGS);
if (MAX_AREAS > 0) AREAS = AREAS.slice(0, MAX_AREAS);

const BASE = 'https://apis.data.go.kr/B551011/KorService2/searchFestival2';
const NUM  = Number(process.env.ROW_SIZE || '50');

async function fetchPageOnce({ lang, areaCode, start, end, pageNo }){
  const url = `${BASE}?` + qs({
    serviceKey: KEY, _type: 'json',
    MobileOS: 'ETC', MobileApp: 'HallyuPass',
    eventStartDate: start, eventEndDate: end,
    areaCode, numOfRows: NUM, arrange: 'C', pageNo, lang
  });
  const j = await fetchJson(url, { label:'tourapi' });
  const body = j?.response?.body;
  const items = body?.items?.item || [];
  return Array.isArray(items) ? items : (items ? [items] : []);
}

async function fetchPageWithRetry(args){
  let delay = 1500;
  for (let attempt=0; attempt<3; attempt++){
    try{
      return await fetchPageOnce(args);
    }catch(e){
      const head = (e && e.head) || '';
      if (head.includes('LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR')){
        console.warn(`[tourapi] rate-limit, retry in ${delay}ms`);
        await sleep(delay);
        delay *= 2;
        continue;
      }
      throw e;
    }
  }
  throw new Error('tourapi: rate-limit retries exceeded');
}

async function run(){
  const start = todayYmd();
  const end   = addDaysYmd(AHEAD);
  const out   = [];

  for (const lang of LANGS){
    for (const area of AREAS){
      console.log(`[FETCH] festivals area=${area} lang=${lang} ${start}-${end}`);
      let page = 1;
      while(true){
        let arr;
        try{
          arr = await fetchPageWithRetry({ lang, areaCode:area, start, end, pageNo: page });
        }catch(e){
          console.warn('[tourapi] fetch failed:', e?.message || e);
          break; // 이 지역/언어 중단
        }

        for (const it of arr){
          out.push({
            source:'tourapi',
            dataset:'festivals',
            external_id: String(it.contentid),
            lang,
            payload: it,
            event_start: it.eventstartdate ? String(it.eventstartdate).slice(0,8) : null,
            event_end:   it.eventenddate   ? String(it.eventenddate).slice(0,8)   : null,
            city: it.addr1 || null,
          });
        }
        if (arr.length < NUM) break;
        page += 1;
        await sleep(1000); // 페이지 사이 슬립
      }
      await sleep(2500);   // 지역 사이 슬립(레이트리밋 완화)
    }
  }

  if (!out.length) throw new Error('TourAPI: no items');
  const r = await upsert('raw_sources', out);
  console.log('tourapi festivals saved:', r.count);
}

run().catch(e=>{ console.error(e); process.exit(1); });
