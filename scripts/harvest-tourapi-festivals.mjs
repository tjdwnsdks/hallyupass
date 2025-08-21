// TourAPI 축제 → raw_sources(dataset:'festival')
// - Encoding 키 그대로 사용
// - FAST_MODE 등 환경변수로 속도/재시도 제어
import { qs } from './lib/util.mjs';
import { upsertRaw } from './lib/db.mjs';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const t = (d=new Date()) => {
  const y=d.getUTCFullYear(),m=String(d.getUTCMonth()+1).padStart(2,'0'),da=String(d.getUTCDate()).padStart(2,'0');
  return `${y}${m}${da}`;
};
const plus = (n, base=new Date()) => { const d=new Date(base); d.setUTCDate(d.getUTCDate()+Number(n||0)); return t(d); };
const looksJson = (s='') => { const x=s.trim(); return x.startsWith('{')||x.startsWith('['); };
const reasonCode = (xml='') => (xml.match(/<returnReasonCode>(\d+)<\/returnReasonCode>/i)||[])[1]||null;
const buildUrl = (base,key,params) => `${base}?serviceKey=${key}${(() => {const q=qs(params);return q?`&${q}`:'';})()}`;

const FAST_MODE     = String(process.env.FAST_MODE||'0') === '1';
const MAX_ATTEMPTS  = Number(process.env.MAX_ATTEMPTS || (FAST_MODE ? 1 : 3));
const ROWS_START    = Number(process.env.ROWS_START   || (FAST_MODE ? 30 : 60));
const ROWS_MIN      = Number(process.env.ROWS_MIN     || 20);
const AREAS_PER_RUN = Number(process.env.AREAS_PER_RUN|| (FAST_MODE ? 3 : 99));
const LANGS_PER_RUN = Number(process.env.LANGS_PER_RUN|| (FAST_MODE ? 1 : 99));

async function fetchPage({ key, areaCode, lang, pageNo, startYmd, endYmd }){
  const base = 'https://apis.data.go.kr/B551011/KorService2/searchFestival2';
  let rows = ROWS_START, wait = 1000;

  for (let attempt=1; attempt<=MAX_ATTEMPTS; attempt++){
    const url = buildUrl(base, key, {
      _type:'json', MobileOS:'ETC', MobileApp:'HallyuPass',
      eventStartDate:startYmd, eventEndDate:endYmd,
      areaCode, numOfRows:rows, arrange:'C', pageNo, lang
    });
    console.log('[GET]', url);

    try{
      const r = await fetch(url, { headers:{Accept:'application/json'} });
      const txt = await r.text();

      if (looksJson(txt)){
        let j=null; try{ j=JSON.parse(txt); }catch{/*noop*/}
        let items = j?.response?.body?.items?.item || [];
        if (!Array.isArray(items)) items = items ? [items] : [];
        return items;
      }

      const code = reasonCode(txt);
      if (code === '22'){ // rate limit
        if (FAST_MODE){ console.warn('[RATE 22] FAST_MODE → skip this page'); return []; }
        console.warn(`[RATE 22] attempt=${attempt} wait=${wait}ms rows=${rows}`);
        await sleep(wait);
        wait *= 2;
        rows = Math.max(ROWS_MIN, Math.floor(rows/2));
        continue;
      }

      console.error('Non-JSON head:', (txt||'').slice(0,200));
      return [];
    }catch(e){
      console.error('fetch error:', e.message);
      if (attempt < MAX_ATTEMPTS){ await sleep(wait); wait *= 2; continue; }
      return [];
    }
  }
  return [];
}

async function run(){
  const key    = process.env.DATA_GO_KR_TOURAPI;            // Encoding Key
  const langs0 = (process.env.TOUR_LANGS || 'ko').split(',').map(s=>s.trim()).filter(Boolean);
  const areas0 = (process.env.AREACODES || '1').split(',').map(s=>s.trim()).filter(Boolean);
  const langs  = langs0.slice(0, LANGS_PER_RUN);
  const areas  = areas0.slice(0, AREAS_PER_RUN);

  const ahead    = parseInt(process.env.DAYS_AHEAD || '60', 10);
  const startYmd = t(), endYmd = plus(ahead);

  for (const lang of langs){
    for (const areaCode of areas){
      console.log(`[FETCH] festivals area=${areaCode} lang=${lang} ${startYmd}-${endYmd}`);
      for (let page=1; page<=20; page++){
        const items = await fetchPage({ key, areaCode, lang, pageNo:page, startYmd, endYmd });
        if (items.length===0){ if(page===1) await sleep(FAST_MODE?150:300); break; }

        for (const it of items){
          try{
            await upsertRaw({
              source:'tourapi',
              dataset:'festival',
              external_id:String(it.contentid),
              lang,
              payload: it,
              event_start: it.eventstartdate ? `${it.eventstartdate.slice(0,4)}-${it.eventstartdate.slice(4,6)}-${it.eventstartdate.slice(6,8)}` : null,
              event_end:   it.eventenddate   ? `${it.eventenddate.slice(0,4)}-${it.eventenddate.slice(4,6)}-${it.eventenddate.slice(6,8)}`   : null,
              city: it.addr1 || null
            });
          }catch(e){ console.error('upsert error:', e.message); }
        }
        if (items.length < 50) break;
        await sleep(FAST_MODE?150:300);
      }
      await sleep(FAST_MODE?200:400);
    }
  }
  console.log('[TourAPI festivals] done (FAST_MODE=' + (FAST_MODE?'1':'0') + ')');
}
run(); // throw 금지
