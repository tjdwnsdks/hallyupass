// TourAPI 축제 → raw_sources(dataset:'festival')
// - supabase-js 미사용(REST 업서트)
// - Encoding 키를 serviceKey에 그대로
// - 22(rate limit) 재시도(백오프), 실패 페이지는 스킵하고 계속
import { qs } from './lib/util.mjs';
import { upsertRaw } from './lib/db.mjs';

function ymdUTC(d=new Date()){ const y=d.getUTCFullYear(), m=String(d.getUTCMonth()+1).padStart(2,'0'), day=String(d.getUTCDate()).padStart(2,'0'); return `${y}${m}${day}`; }
function plusDaysYmd(n, base=new Date()){ const d=new Date(base); d.setUTCDate(d.getUTCDate()+Number(n||0)); return ymdUTC(d); }
function buildUrl(base, key, params){ const rest = qs(params); return `${base}?serviceKey=${key}${rest?`&${rest}`:''}`; }
function parseMaybeJson(txt){ try{ return JSON.parse(txt); }catch{ return null; } }
const sleep = ms => new Promise(r=>setTimeout(r, ms));

function reasonCode(txt){ const m = txt.match(/<returnReasonCode>(\d+)<\/returnReasonCode>/i); return m?m[1]:null; }

async function fetchPageOnce(args){
  const base = 'https://apis.data.go.kr/B551011/KorService2/searchFestival2';
  const url = buildUrl(base, args.key, {
    _type:'json', MobileOS:'ETC', MobileApp:'HallyuPass',
    eventStartDate: args.startYmd, eventEndDate: args.endYmd,
    areaCode: args.areaCode, numOfRows: args.rows, arrange:'C', pageNo: args.pageNo, lang: args.lang
  });
  console.log('[GET]', url);
  const r = await fetch(url, { headers:{Accept:'application/json'} });
  const txt = await r.text();
  const j = parseMaybeJson(txt);
  if(j){
    let items = j?.response?.body?.items?.item || [];
    if(!Array.isArray(items)) items = items ? [items] : [];
    return { ok:true, items };
  }
  return { ok:false, code: reasonCode(txt), head: txt.slice(0,200) };
}

async function fetchPage(args){
  let rows = 50, delay = 1200;
  for(let attempt=0; attempt<4; attempt++){
    const res = await fetchPageOnce({ ...args, rows });
    if(res.ok) return res.items;
    if(res.code === '22'){ // rate limit
      console.warn(`[RATE] 22 attempt=${attempt+1} wait=${delay}ms rows=${rows}`);
      await sleep(delay);
      delay *= 2;
      rows = Math.max(20, Math.floor(rows/2));
      continue;
    }
    console.error('Non-JSON head:', res.head);
    return [];
  }
  return [];
}

async function run(){
  const key   = process.env.DATA_GO_KR_TOURAPI; // 인코딩 키
  const langs = (process.env.TOUR_LANGS || 'ko').split(',').map(s=>s.trim()).filter(Boolean);
  const areas = (process.env.AREACODES || '1').split(',').map(s=>s.trim()).filter(Boolean);
  const ahead = parseInt(process.env.DAYS_AHEAD || '60', 10);
  const startYmd = ymdUTC(), endYmd = plusDaysYmd(ahead);

  for(const lang of langs){
    for(const areaCode of areas){
      console.log(`[FETCH] festivals area=${areaCode} lang=${lang} ${startYmd}-${endYmd}`);
      for(let page=1; page<=20; page++){
        const items = await fetchPage({ key, areaCode, lang, pageNo: page, startYmd, endYmd });
        if(items.length===0){ if(page===1) await sleep(400); break; }
        for(const it of items){
          try{
            await upsertRaw({
              source:'tourapi',
              dataset:'festival',
              external_id: String(it.contentid),
              lang,
              payload: it,
              event_start: it.eventstartdate ? `${it.eventstartdate.slice(0,4)}-${it.eventstartdate.slice(4,6)}-${it.eventstartdate.slice(6,8)}` : null,
              event_end:   it.eventenddate   ? `${it.eventenddate.slice(0,4)}-${it.eventenddate.slice(4,6)}-${it.eventenddate.slice(6,8)}`   : null,
              city: it.addr1 || null
            });
          }catch(e){ console.error('upsert error:', e.message); }
        }
        if(items.length < 50) break;
        await sleep(300);
      }
      await sleep(500);
    }
  }
}
run().catch(e=>{ console.error(e); /* 실패로 종료하지 않음 */ });
