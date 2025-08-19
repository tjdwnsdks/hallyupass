import { qs, todayYmd, plusDaysYmd, encodeKeyOnce } from './lib/util.mjs';
import { upsert } from './lib/sb.mjs';

const RAWKEY = process.env.DATA_GO_KR_KCISA || process.env.DATA_GO_KR_KEY;
const KEY    = encodeKeyOnce(RAWKEY);
const BASE  = 'https://apis.data.go.kr/B553457/cultureInfo';
const AHEAD = Number(process.env.DAYS_AHEAD || '60');

async function run(){
  const from = todayYmd(), to = plusDaysYmd(AHEAD);
  const out=[];
  for(let page=1; page<=12; page++){
    const url = `${BASE}/period2?` + qs({ serviceKey:KEY, from, to, cPage:page, rows:50 });
    const r = await fetch(url);
    const txt = await r.text();
    let items=[];
    try{
      const j = JSON.parse(txt);
      items = j?.response?.body?.items || j?.response?.body?.item || j?.items || [];
    }catch(e){
      console.error('KCISA non-JSON head:', txt.slice(0,200));
      console.error('URL:', url);
      throw e;
    }
    if(!items.length) break;
    for(const it of items){
      const ext = String(it.cul_id || it.id || `${it.title}|${it.startDate}|${it.place}`);
      out.push({ source:'kcisa', dataset:'performance', external_id: ext, lang:'ko',
                 payload: it, event_start: it.startDate?.slice(0,10) || null,
                 event_end: it.endDate?.slice(0,10) || null, city: it.place || null });
    }
    if(items.length<50) break;
  }
  const res = await upsert('raw_sources', out);
  console.log('kcisa saved:', res.count);
}
run().catch(e=>{ console.error(e); process.exit(1); });
