// TourAPI 숙박(contentTypeId=32) → raw_sources(dataset: 'stay')
import { qs } from './lib/util.mjs';
import { upsertRaw } from './lib/db.mjs';

// serviceKey는 인코딩 키 그대로 사용
function buildUrl(base, rawKey, params){
  const rest = qs(params);
  return `${base}?serviceKey=${rawKey}${rest ? `&${rest}` : ''}`;
}

async function fetchPage({ key, areaCode, lang, pageNo }){
  const base = 'https://apis.data.go.kr/B551011/KorService2/areaBasedList2';
  const url = buildUrl(base, key, {
    _type: 'json',
    MobileOS: 'ETC',
    MobileApp: 'HallyuPass',
    contentTypeId: 32,          // 숙박
    areaCode,
    numOfRows: 100,
    arrange: 'C',
    pageNo,
    lang
  });

  console.log('[GET stay]', url);
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  const txt = await r.text();
  let items = [];
  try{
    const j = JSON.parse(txt);
    items = j?.response?.body?.items?.item || [];
    if (!Array.isArray(items)) items = items ? [items] : [];
  }catch(e){
    console.error('Non-JSON head:', txt.slice(0,200));
    console.error('URL:', url);
    throw e;
  }
  return items;
}

async function run(){
  const key   = process.env.DATA_GO_KR_TOURAPI; // 인코딩 키
  const langs = (process.env.TOUR_LANGS || 'ko').split(',').map(s=>s.trim()).filter(Boolean);
  const areas = (process.env.AREACODES || '1').split(',').map(s=>s.trim()).filter(Boolean);

  for (const lang of langs){
    for (const areaCode of areas){
      console.log(`[FETCH] stay area=${areaCode} lang=${lang}`);
      for (let page=1; page<=20; page++){
        const items = await fetchPage({ key, areaCode, lang, pageNo: page });
        if (items.length === 0) break;

        for (const it of items){
          const row = {
            source: 'tourapi',
            dataset: 'stay',
            external_id: String(it.contentid),
            lang,
            payload: it,
            event_start: null,
            event_end: null,
            city: it.addr1 || null
          };
          try{ await upsertRaw(row); }catch(err){ console.error('upsert error:', err.message); }
        }
        if (items.length < 100) break;
      }
    }
  }
}
run().catch(e=>{ console.error(e); process.exit(1); });
