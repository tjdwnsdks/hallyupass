// scripts/harvest-kcisa.mjs
import { createClient } from '@supabase/supabase-js';
import { qs, fetchJson, encodeKeyOnce, todayYmd, plusDaysYmd, sleep } from './lib/util.mjs';

const RAW = process.env.DATA_GO_KR_KCISA || process.env.DATA_GO_KR_KEY || "";
const KEY = encodeKeyOnce(RAW); // 디코딩키여도 1회 인코딩
const FROM = todayYmd();
const TO   = plusDaysYmd(Number(process.env.DAYS_AHEAD || '60'));

const BASES = [
  'https://apis.data.go.kr/B553457/cultureInfo/period2',
  'https://apis.data.go.kr/B553457/cultureInfo/period'
];
// KCISA는 API별로 _type=resultType 혼재
const TYPE_PARAMS = [
  {}, { _type:'json' }, { resultType:'json' }
];
// 페이징 파라미터 혼재
const Pagers = [
  { cPage:1, rows:100 },
  { pageIndex:1, pageSize:100 }
];

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

function shapeItems(j){
  // 가능한 구조 모두 대비
  const a = j?.response?.body?.items ?? j?.response?.body?.item ?? j?.items ?? [];
  if(Array.isArray(a)) return a;
  if(a && typeof a==='object') return Object.values(a);
  return [];
}

async function tryOnce(base, typeParam, pager){
  const url = `${base}?` + qs({ serviceKey: KEY, from: FROM, to: TO, ...typeParam, ...pager });
  const json = await fetchJson(url, {retry: 4, minDelayMs: 900});
  const items = shapeItems(json);
  return { url, items };
}

async function run(){
  let saved = 0, tried = 0, ok = false;
  for(const b of BASES){
    for(const t of TYPE_PARAMS){
      for(const p of Pagers){
        tried++;
        try{
          const { url, items } = await tryOnce(b, t, p);
          if(items.length===0){ continue; }
          ok = true;
          console.log(`KCISA OK: ${url} items=${items.length}`);
          // 최대 1000건까지만 페이징 확장 시도
          let page=2;
          while(items.length < 1000){
            const nextPager = { ...p };
            if('cPage' in nextPager) nextPager.cPage = page;
            if('pageIndex' in nextPager) nextPager.pageIndex = page;
            try{
              const { items:more } = await tryOnce(b, t, nextPager);
              if(!more.length) break;
              items.push(...more);
              page++;
              await sleep(1000);
            }catch(e){
              break;
            }
          }
          // 업서트
          const rows = items.map(it=>{
            const ext = String(it.cul_id || it.id || it.CUL_ID || it.TITLE || `${it.title}|${it.startDate}|${it.place}`);
            return {
              source: 'kcisa',
              dataset: 'performance',
              external_id: ext,
              lang: 'ko',
              payload: it,
              event_start: (it.startDate || it.START_DATE || "").slice(0,10) || null,
              event_end:   (it.endDate   || it.END_DATE   || "").slice(0,10) || null,
              city: it.place || it.PLACE || null,
              fetched_at: new Date().toISOString()
            };
          });
          if(rows.length){
            const { error } = await sb.from('raw_sources').upsert(rows, { onConflict: 'source,dataset,external_id,lang' });
            if(error) throw new Error(`upsert raw_sources error: ${error.message}`);
            saved += rows.length;
          }
          // 한 조합 성공하면 종료
          b!==BASES[0] && console.warn('KCISA: fallback endpoint used');
          console.log('kcisa saved:', saved);
          return;
        }catch(e){
          const head = e?.meta?.head || '';
          console.warn('KCISA try fail', {base:b, t, p, status:e?.meta?.status, head: head.slice(0,120)});
          await sleep(500);
        }
      }
    }
  }
  if(!ok) throw new Error(`KCISA all combinations failed after ${tried} tries`);
}

run().catch(e=>{ console.error(e?.meta||e); process.exit(1); });
