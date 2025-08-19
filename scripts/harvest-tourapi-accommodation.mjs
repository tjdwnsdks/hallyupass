import { qs, pagedJson } from './lib/util.mjs';
import { upsert } from './lib/sb.mjs';

const KEY    = process.env.DATA_GO_KR_TOURAPI || process.env.DATA_GO_KR_KEY;
const LANGS  = (process.env.TOUR_LANGS || 'ko,en').split(',').map(s=>s.trim().toLowerCase());
const AREAS  = (process.env.AREACODES || '1,2,3,4,5,6,7,8,31,32,33,34,35,36,37,38,39').split(',').map(s=>Number(s.trim()));
const baseFor = (lang)=>{
  switch(lang){
    case 'ko':   return 'https://apis.data.go.kr/B551011/KorService2';
    case 'en':   return 'https://apis.data.go.kr/B551011/EngService2';
    case 'ja':   return 'https://apis.data.go.kr/B551011/JpnService2';
    case 'zh':   return 'https://apis.data.go.kr/B551011/ChsService2';
    case 'zh-tw':return 'https://apis.data.go.kr/B551011/ChtService2';
    case 'de':   return 'https://apis.data.go.kr/B551011/GerService2';
    default:     return 'https://apis.data.go.kr/B551011/EngService2';
  }
};

async function run(){
  const out=[];
  for(const lang of LANGS){
    const BASE = baseFor(lang);
    for(const areaCode of AREAS){
      const q = { serviceKey:KEY, MobileOS:'ETC', MobileApp:'HallyuPass', _type:'json',
                  contentTypeId:32, areaCode, numOfRows:30, arrange:'C' };
      const build = (pageNo)=> `${BASE}/areaBasedList2?${qs({...q, pageNo})}`;
      for await (const j of pagedJson(build,1,10)){
        const items = j?.response?.body?.items?.item || [];
        if(items.length===0) break;
        for(const it of items){
          out.push({ source:'tourapi', dataset:'accommodation', external_id:String(it.contentid), lang, payload:it, city: it.addr1||null });
        }
        if(items.length<30) break;
      }
    }
  }
  const res = await upsert('raw_sources', out);
  console.log('tourapi accommodation saved:', res.count);
}
run().catch(e=>{ console.error(e); process.exit(1); });
