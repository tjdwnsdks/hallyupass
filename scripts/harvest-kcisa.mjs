// KCISA 공연·전시·행사 → raw_sources(dataset:'performance')
// 종료하지 않음. JSON 실패 시 폴백 시도 후 스킵.
import { qs } from './lib/util.mjs';
import { upsertRaw } from './lib/db.mjs';

const BASES = [
  'https://apis.data.go.kr/B553457/cultureinfo/period2', // 소문자 권장
  'https://apis.data.go.kr/B553457/cultureInfo/period2', // 대문자 폴백
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function ymdUTC(d = new Date()){
  const y=d.getUTCFullYear(), m=String(d.getUTCMonth()+1).padStart(2,'0'), day=String(d.getUTCDate()).padStart(2,'0');
  return `${y}${m}${day}`;
}
function plusDaysYmd(n, base=new Date()){
  const d=new Date(base); d.setUTCDate(d.getUTCDate()+Number(n||0)); return ymdUTC(d);
}
function buildUrl(base, key, params){
  const rest = qs(params);
  return `${base}?serviceKey=${key}${rest?`&${rest}`:''}`;
}
function safeJson(txt){ try{ return JSON.parse(txt); }catch{ return null; } }

async function fetchJsonVariants(key, from, to, page){
  const paramVariants = [
    { _type:'json', from, to, cPage:page, rows:50 },
    { type:'json',  from, to, cPage:page, rows:50 },
  ];
  for(const base of BASES){
    for(const p of paramVariants){
      const url = buildUrl(base, key, p);
      console.log('[GET kcisa]', url);
      try{
        const r = await fetch(url, { headers:{Accept:'application/json'} });
        const txt = await r.text();
        const j = safeJson(txt);
        if(!j){
          console.error('KCISA non-JSON head:', txt.slice(0,200));
          continue;
        }
        let items = j?.response?.body?.items ?? j?.response?.body?.item ?? j?.items ?? [];
        if(!Array.isArray(items)) items = items ? [items] : [];
        return items;
      }catch(e){
        console.error('KCISA request error:', e.message);
      }
    }
  }
  return null; // 모든 조합 실패
}

async function run(){
  const key   = process.env.DATA_GO_KR_KCISA; // 인코딩 키(Encoding)
  const ahead = parseInt(process.env.DAYS_AHEAD || '60', 10);
  const from  = ymdUTC();
  const to    = plusDaysYmd(ahead);

  let saved = 0;
  for(let page=1; page<=20; page++){
    const items = await fetchJsonVariants(key, from, to, page);
    if(items === null){
      console.warn('[KCISA] JSON 응답 획득 실패. 이번 실행을 스킵합니다.');
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
    if(items.length < 50) break;        // 마지막 페이지 추정
    await sleep(500);                    // 속도 제한
  }
  console.log(`[KCISA] saved=${saved}`);
}
run();
