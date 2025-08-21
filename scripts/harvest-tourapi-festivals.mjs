// TourAPI 축제 → raw_sources(dataset:'festival')
// - supabase-js 미사용(REST 업서트)
// - 인코딩(Encoding) 키를 serviceKey에 그대로
// - 22(요청 초과) 시 백오프 재시도, 실패 시 해당 페이지 스킵하고 계속
import { qs } from './lib/util.mjs';
import { upsertRaw } from './lib/db.mjs';

function ymdUTC(d = new Date()){
  const y=d.getUTCFullYear(), m=String(d.getUTCMonth()+1).padStart(2,'0'), day=String(d.getUTCDate()).padStart(2,'0');
  return `${y}${m}${day}`;
}
function plusDaysYmd(n, base=new Date()){ const d=new Date(base); d.setUTCDate(d.getUTCDate()+Number(n||0)); return ymdUTC(d); }

function buildUrl(base, key, params){
  const rest = qs(params);
  return `${base}?serviceKey=${key}${rest?`&${rest}`:''}`;
}

function parseMaybeJson(text){
  try { return JSON.parse(text); } catch { return null; }
}

function extractReason(text){
  // TourAPI 오류 헤더에서 ReasonCode 추출
  const m = text.match(/<returnReasonCode>(\d+)<\/returnReasonCode>/i);
  return m ? m[1] : null;
}

async function fetchPageOnce({key, areaCode, lang, pageNo, startYmd, endYmd, numOfRows=50}){
  const base = 'https://apis.data.go.kr/B551011/KorService2/searchFestival2';
  const url = buildUrl(base, key, {
    _type:'json', MobileOS:'ETC', MobileApp:'HallyuPass',
    eventStartDate: startYmd, eventEndDate: endYmd,
    areaCode, numOfRows, arrange:'C', pageNo, lang
  });
  console.log('[GET]', url);
  const r = await fetch(url, { headers:{ Accept:'application/json' } });
  const txt = await r.text();
  const j = parseMaybeJson(txt);
  if (j) {
    let items = j?.response?.body?.items?.item || [];
    if (!Array.isArray(items)) items = items ? [items] : [];
    return { items, txt, ok:true };
  }
  // 비JSON: 에러일 가능성
  return { items:[], txt, ok:false, reason: extractReason(txt) };
}

async function fetchPageWithRetry(args){
  const maxRetry = 3;
  let delay = 1500;
  let rows = 50; // 요청 과다시 줄인다
  for (let i=0;i<=maxRetry;i++){
    const {items, ok, txt, reason} = await fetchPageOnce({ ...args, numOfRows: rows });
    if (ok) return items;
    // 22: LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR
    if (reason === '22'){
      console.warn(`[RATE-LIMIT] reason=22 retry=${i+1}/${maxRetry} wait=${delay}ms`);
      await new Promise(r=>setTimeout(r, delay));
      delay *= 2;
      rows = Math.max(20, Math.floor(rows/2)); // 점진적으로 줄임
      continue;
    }
    console.error('Non-JSON head:', txt.slice(0,200));
    // 다른 오류는 한 번만 보고 스킵
    return [];
  }
  return [];
}

async function run(){
  const key   = process.env.DATA_GO_KR_TOURAPI; // 인코딩 키
  const langs = (process.env.TOUR_LANGS || 'ko').split(',').map(s=>s.trim()).filter(Boolean);
  const areas = (process.env.AREACODES || '1').split(',').map(s=>s.trim()).filter(Boolean);
  const ahead = parseInt(process.env.DAYS_AHEAD || '60', 10);
  const startYmd = ymdUTC();
  const endYmd   = plusDaysYmd(ahead);

  for (const lang of langs){
    for (const areaCode of areas){
      console.log(`[FETCH] festivals area=${areaCode} lang=${lang} ${startYmd}-${endYmd}`);
      for (let page=1; page<=20; page++){
        const items = await fetchPageWithRetry({ key, areaCode, lang, pageNo:page, startYmd, endYmd });
        if (items.length === 0){ if (page===1) await new Promise(r=>setTimeout(r, 500)); break; }

        for (const it of items){
          const row = {
            source:'tourapi',
            dataset:'festival',
            external_id:String(it.contentid),
            lang,
            payload: it,
            event_start: it.eventstartdate ? `${it.eventstartdate.slice(0,4)}-${it.eventstartdate.slice(4,6)}-${it.eventstartdate.slice(6,8)}` : null,
            event_end:   it.eventenddate   ? `${it.eventenddate.slice(0,4)}-${it.eventenddate.slice(4,6)}-${it.eventenddate.slice(6,8)}`   : null,
            city: it.addr1 || null
          };
          try{ await upsertRaw(row); }catch(err){ console.error('upsert error:', err.message); }
        }
        if (items.length < 50) break;
        await new Promise(r=>setTimeout(r, 400)); // 페이지 간 rate 보호
      }
      await new Promise(r=>setTimeout(r, 600)); // 지역 간 보호
    }
  }
}

run().catch(e=>{ console.error(e); process.exit(0); }); // 실패로 종료하지 않음
