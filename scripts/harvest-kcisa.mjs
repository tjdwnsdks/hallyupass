// KCISA 공연·전시·행사 → raw_sources(dataset:'performance')
// - supabase-js 미사용(REST 업서트)
// - Encoding 키를 serviceKey에 그대로
import { qs } from './lib/util.mjs';
import { upsertRaw } from './lib/db.mjs';

const BASES = [
  'https://apis.data.go.kr/B553457/cultureinfo/period2', // 소문자 우선
  'https://apis.data.go.kr/B553457/cultureInfo/period2', // 대문자 폴백
];

// UTC YYYYMMDD
function ymdUTC(d = new Date()){
  const y=d.getUTCFullYear(), m=String(d.getUTCMonth()+1).padStart(2,'0'), day=String(d.getUTCDate()).padStart(2,'0');
  return `${y}${m}${day}`;
}
function plusDaysYmd(n, base=new Date()){ const d=new Date(base); d.setUTCDate(d.getUTCDate()+Number(n||0)); return ymdUTC(d); }

function buildUrl(base, key, params){ const rest = qs(params); return `${base}?serviceKey=${key}${rest?`&${rest}`:''}`; }
function parseMaybeJson(txt){ try{ return JSON.parse(txt); }catch{ return null; } }
const sleep = ms => new Promise(r=>setTimeout(r, ms));

async function fetchOnce(url){
  const r = await fetch(url, { headers:{Accept:'application/json'} });
  const txt = await r.text();
  const j = parseMaybeJson(txt);
  return { j, txt };
}

async function run(){
  const key   = process.env.DATA_GO_KR_KCISA; // 인코딩 키
  const ahead = parseInt(process.env.DAYS_AHEAD || '60', 10);
  const from  = ymdUTC();
  const to    = plusDaysYmd(ahead);
  let saved = 0;

  for(let page=1; page<=20; page++){
    // _type/json 키 케이스 두 가지를 모두 시도
    const paramsList = [
      { _type:'json', from, to, cPage:page, rows:50 },
      { type:'json',  from, to, cPage:page, rows:50 },
    ];

    let items = null;
    for(const base of BASES){
      for(const p of paramsList){
        const url = buildUrl(base, key, p);
        console.log('[GET kcisa]', url);
        const { j, txt } = await fetchOnce(url);
        if(!j){
          console.error('KCISA non-JSON head:', txt.slice(0,200));
          continue; // 다음 조합 시도
        }
        const rawItems = j?.response?.body?.items ?? j?.response?.body?.item ?? j?.items ?? [];
        items = Array.isArray(rawItems) ? rawItems : (rawItems ? [rawItems] : []);
        if(items.length) break;
      }
      if(items && items.length) break;
    }

    if(items === null){
      console.warn('[KCISA] 모든 조합에서 JSON 파싱 실패. 워크플로는 계속 진행합니다.');
      break;
    }
    if(items.length === 0){
      console.log('[KCISA] 더 이상 항목 없음');
      break;
    }

    for(const it of items){
      const ext = String(it.cul_id || it.id || `${it.title||''}|${it.startDate||''}|${it.place||''}`);
      try{
        await upsertRaw({
          source:'kcisa',
          dataset:'performance',
          external_id: ext,
          lang:'ko',
          payload: it,
          event_start: it.startDate?.slice(0,10) || null,
          event_end:   it.endDate?.slice(0,10)   || null,
          city: it.place || null
        });
        saved++;
      }catch(e){ console.error('upsert error:', e.message); }
    }

    if(items.length < 50) break;
    await sleep(500);
  }

  console.log(`[KCISA] saved=${saved}`);
}
run().catch(e=>{ console.error(e); /* 실패로 종료하지 않음 */ });
