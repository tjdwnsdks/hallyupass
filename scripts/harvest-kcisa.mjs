// KCISA 공연·전시·행사 → raw_sources(dataset: 'performance')
// - supabase-js 미사용(REST 업서트)
// - 인코딩(Encoding) 키를 serviceKey에 그대로
import { qs } from './lib/util.mjs';
import { upsertRaw } from './lib/db.mjs';

const BASES = [
  'https://apis.data.go.kr/B553457/cultureinfo/period2', // 소문자 권장
  'https://apis.data.go.kr/B553457/cultureInfo/period2', // 대문자 Fallback
];

// YYYYMMDD UTC
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

async function tryFetchJson(url){
  const r = await fetch(url, { headers:{ Accept:'application/json' } });
  const text = await r.text();
  const j = parseMaybeJson(text);
  if (j) return { json:j, text };
  // SOAP Fault 등 XML인 경우
  return { json:null, text };
}

async function run(){
  const key   = process.env.DATA_GO_KR_KCISA; // 인코딩 키
  const ahead = parseInt(process.env.DAYS_AHEAD || '60', 10);
  const from  = ymdUTC();
  const to    = plusDaysYmd(ahead);

  let saved = 0;
  outer:
  for (let page=1; page<=20; page++){
    // _type 또는 type 둘 다 시도
    const paramsList = [
      { _type:'json', from, to, cPage:page, rows:50 },
      { type:'json',  from, to, cPage:page, rows:50 },
    ];

    let items = null;
    for (const base of BASES){
      for (const p of paramsList){
        const url = buildUrl(base, key, p);
        console.log('[GET kcisa]', url);
        const { json, text } = await tryFetchJson(url);
        if (!json){
          // SOAP Fault/오류 헤더 프린트 후 다음 조합 시도
          console.error('KCISA non-JSON head:', text.slice(0,200));
          continue;
        }
        const bodyItems = json?.response?.body?.items || json?.response?.body?.item || json?.items || [];
        items = Array.isArray(bodyItems) ? bodyItems : (bodyItems ? [bodyItems] : []);
        if (items.length) { // 유효 응답 확보
          break;
        }
      }
      if (items && items.length) break;
    }

    if (!items){
      console.warn('[KCISA] 모든 조합에서 JSON 파싱 실패. 이번 페이지 스킵');
      break outer; // 계속 SOAP Fault면 루프 중단(워크플로 실패 아님)
    }
    if (items.length === 0){
      console.log('[KCISA] 더 이상 아이템 없음');
      break;
    }

    for (const it of items){
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
      }catch(err){
        console.error('upsert error:', err.message);
      }
    }
    if (items.length < 50) break; // 마지막 페이지
    // API 보호를 위해 살짝 쉰다
    await new Promise(r=>setTimeout(r, 500));
  }

  console.log(`[KCISA] saved=${saved}`);
}

run().catch(e=>{ console.error(e); process.exit(0); }); // 실패로 종료하지 않음
