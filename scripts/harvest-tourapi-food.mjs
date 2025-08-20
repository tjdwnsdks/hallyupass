// TourAPI 음식( contentTypeId=39 ) → raw_sources (REST upsert)
import { qs } from './lib/util.mjs';
import { upsertRaw } from './lib/db.mjs'; // @supabase/supabase-js 사용 안함

// YYYYMMDD UTC
function ymdUTC(d = new Date()){
  const y=d.getUTCFullYear(), m=String(d.getUTCMonth()+1).padStart(2,'0'), day=String(d.getUTCDate()).padStart(2,'0');
  return `${y}${m}${day}`;
}
function plusDaysYmd(n, base=new Date()){ const d=new Date(base); d.setUTCDate(d.getUTCDate()+Number(n||0)); return ymdUTC(d); }

// serviceKey는 절대 인코딩하지 않고 그대로 붙임
function buildUrl(base, rawKey, params){
  const rest = qs(params);
  return `${base}?serviceKey=${rawKey}${rest ? `&${rest}` : ''}`;
}

async function fetchPage({key, areaCode, lang, pageNo}){
  const base = 'https://apis.data.go.kr/B551011/KorService2/areaBasedList2';
  const url = buildUrl(base, key, {
    _type: 'json',
    MobileOS: 'ETC',
    MobileApp: 'HallyuPass',
    contentTypeId: 39, // 음식
    areaCode,
    numOfRows: 100,
    arrange: 'C',
    pageNo,
    lang
  });

  console.log('[GET]', url);
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  const txt = await r.text();
  let items=[];
  try{
    const j = JSON.parse(txt);
    items = j?.response?.body?.items?.item || [];
    if(!Array.isArray(items)) items = items ? [items] : [];
  }catch(e){
    console.error('Non-JSON head:', txt.slice(0,200));
    console.error('URL:', url);
    throw e;
  }
  return items;
}

async function run(){
  const key   = process.env.DATA_GO_KR_TOURAPI; // 인코딩 키 그대로
  const langs = (process.env.TOUR_LANGS || 'ko').split(',').map(s=>s.trim()).filter(Boolean);
  const areas = (process.env.AREACODES || '1').split(',').map(s=>s.trim()).filter(Boolean);

  for(const lang of langs){
    for(const areaCode of areas){
      console.log(`[FETCH] food area=${areaCode} lang=${lang}`);
      for(let page=1; page<=20; page++){
        const items = await fetchPage({key, areaCode, lang, pageNo: page});
        if(items.length===0) break;

        for(const it of items){
          const row = {
            source: 'tourapi',
            dataset: 'food',
            external_id: String(it.contentid),
            lang,
            payload: it,
            event_start: null,
            event_end: null,
            city: it.addr1 || null
          };
          try{ await upsertRaw(row); }catch(err){ console.error('upsert error:', err.message); }
        }
        if(items.length<100) break;
      }
    }
  }
}

run().catch(e=>{ console.error(e); process.exit(1); });
