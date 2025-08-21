// TourAPI 축제 → raw_sources(dataset:'festival')
// - Encoding 키 그대로 사용
// - 22 레이트리밋 시 백오프·감속·재시도, 실패 페이지는 스킵
import { qs } from './lib/util.mjs';
import { upsertRaw } from './lib/db.mjs';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function ymdUTC(d=new Date()){const y=d.getUTCFullYear(),m=String(d.getUTCMonth()+1).padStart(2,'0'),da=String(d.getUTCDate()).padStart(2,'0');return `${y}${m}${da}`;}
function plusDaysYmd(n,base=new Date()){const d=new Date(base);d.setUTCDate(d.getUTCDate()+Number(n||0));return ymdUTC(d);}
function buildUrl(base,key,params){const rest=qs(params);return `${base}?serviceKey=${key}${rest?`&${rest}`:''}`;}
function looksJson(txt){const t=txt.trim();return t.startsWith('{')||t.startsWith('[');}
function reasonCode(xml){const m=xml.match(/<returnReasonCode>(\d+)<\/returnReasonCode>/i);return m?m[1]:null;}

async function fetchPage({ key, areaCode, lang, pageNo, startYmd, endYmd }){
  const base = 'https://apis.data.go.kr/B551011/KorService2/searchFestival2';
  let rows = 60, wait = 1000;

  for (let attempt=1; attempt<=4; attempt++){
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
        let j; try { j = JSON.parse(txt); } catch { j = null; }
        if (j){
          let items = j?.response?.body?.items?.item || [];
          if (!Array.isArray(items)) items = items ? [items] : [];
          return items;
        }
      }
      const code = reasonCode(txt || '');
      if (code === '22'){
        console.warn(`[RATE 22] attempt=${attempt} wait=${wait}ms rows=${rows}`);
        await sleep(wait);
        wait *= 2;
        rows = Math.max(20, Math.floor(rows/2));
        continue;
      }
      console.error('Non-JSON head:', (txt||'').slice(0,200));
      return []; // 기타 오류는 스킵
    }catch(e){
      console.error('fetch error:', e.message);
      await sleep(wait);
      wait *= 2;
    }
  }
  return []; // 재시도 한계 초과
}

async function run(){
  const key   = process.env.DATA_GO_KR_TOURAPI; // Encoding Key
  const langs = (process.env.TOUR_LANGS || 'ko').split(',').map(s=>s.trim()).filter(Boolean);
  const areas = (process.env.AREACODES || '1').split(',').map(s=>s.trim()).filter(Boolean);
  const ahead = parseInt(process.env.DAYS_AHEAD || '60', 10);
  const startYmd = ymdUTC(), endYmd = plusDaysYmd(ahead);

  for (const lang of langs){
    for (const areaCode of areas){
      console.log(`[FETCH] festivals area=${areaCode} lang=${lang} ${startYmd}-${endYmd}`);
      for (let page=1; page<=20; page++){
        const items = await fetchPage({ key, areaCode, lang, pageNo:page, startYmd, endYmd });
        if (items.length===0){ if(page===1) await sleep(300); break; }

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
        await sleep(250);
      }
      await sleep(400);
    }
  }
  console.log('[TourAPI festivals] done');
}
run(); // 절대 throw하지 않음
