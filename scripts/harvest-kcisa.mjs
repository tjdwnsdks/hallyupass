// KCISA 공연·전시·행사 → raw_sources(dataset:'performance')
// - supabase-js 미사용
// - Encoding 키를 그대로 serviceKey에 사용
import { qs } from './lib/util.mjs';
import { upsertRaw } from './lib/db.mjs';

const BASES = [
  'https://apis.data.go.kr/B553457/cultureinfo/period2', // 소문자 권장
  'https://apis.data.go.kr/B553457/cultureInfo/period2', // 대문자 폴백
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function ymdUTC(d=new Date()){const y=d.getUTCFullYear(),m=String(d.getUTCMonth()+1).padStart(2,'0'),da=String(d.getUTCDate()).padStart(2,'0');return `${y}${m}${da}`;}
function plusDaysYmd(n,base=new Date()){const d=new Date(base);d.setUTCDate(d.getUTCDate()+Number(n||0));return ymdUTC(d);}

function buildUrl(base,key,params){const rest=qs(params);return `${base}?serviceKey=${key}${rest?`&${rest}`:''}`;}
function looksJson(txt){const t=txt.trim();return t.startsWith('{')||t.startsWith('[');}
function pickItems(j){
  const body = j?.response?.body;
  let items = body?.items ?? body?.item ?? j?.items ?? [];
  if (!Array.isArray(items)) items = items ? [items] : [];
  return items;
}
function xmlReason(txt){
  const msg = (txt.match(/<returnAuthMsg>([^<]+)<\/returnAuthMsg>/i)||[])[1]||'';
  const code= (txt.match(/<returnReasonCode>(\d+)<\/returnReasonCode>/i)||[])[1]||'';
  return {msg, code};
}

async function fetchOne(url){
  try{
    const r = await fetch(url,{headers:{Accept:'application/json'}});
    const txt = await r.text();
    if (looksJson(txt)) {
      try { return { json: JSON.parse(txt) }; }
      catch { /* fallthrough to xml */ }
    }
    // JSON 아님 → XML/에러로 처리
    return { xml: txt };
  }catch(e){
    return { err: e };
  }
}

async function tryFetchPage(key, from, to, page){
  // 파라미터·베이스 대체 시도 (문서/게이트웨이 편차 대응)
  const variants = [
    { _type:'json', from, to, cPage:page, rows:50 },
    { type:'json',  from, to, cPage:page, rows:50 },
    { _type:'json', from, to, cPage:page, numOfRows:50 },
  ];

  for (const base of BASES){
    for (const p of variants){
      const url = buildUrl(base, key, p);
      console.log('[GET kcisa]', url);
      const res = await fetchOne(url);
      if (res.json){
        const items = pickItems(res.json);
        return { items };
      }
      if (res.xml){
        // SOAP Fault 등
        console.error('KCISA non-JSON head:', res.xml.slice(0,200));
        const { msg, code } = xmlReason(res.xml);
        if (code === '22') {           // 과다요청
          await sleep(1500);
          continue;
        }
        if (code === '30') {           // SERVICE_KEY_IS_NOT_REGISTERED_ERROR
          // 키/엔드포인트 문제 → 다음 조합 시도만 하고 계속
          continue;
        }
        // 기타 에러도 다음 조합 시도
        continue;
      }
      if (res.err){
        console.error('KCISA request error:', res.err.message);
        await sleep(600);
      }
    }
  }
  return { items: null }; // 모든 조합 실패
}

async function run(){
  const key   = process.env.DATA_GO_KR_KCISA; // Encoding Key
  const ahead = parseInt(process.env.DAYS_AHEAD || '60', 10);
  const from  = ymdUTC();
  const to    = plusDaysYmd(ahead);

  let saved = 0;
  for (let page=1; page<=20; page++){
    const { items } = await tryFetchPage(key, from, to, page);
    if (items === null){
      console.warn('[KCISA] JSON 응답 확보 실패. 실행 스킵.');
      break;
    }
    if (items.length === 0){
      console.log('[KCISA] 더 이상 항목 없음');
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
      }catch(e){ console.error('upsert error:', e.message); }
    }

    if (items.length < 50) break;
    await sleep(500);
  }
  console.log(`[KCISA] saved=${saved}`);
}
run(); // 절대 throw하지 않음
