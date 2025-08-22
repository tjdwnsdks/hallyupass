// scripts/harvest-tourapi-attractions.mjs
import { qs, fetchJson, sleep, normalizeKey } from './lib/util.mjs';
import { upsert } from './lib/sb.mjs';

const RAW_KEY = process.env.DATA_GO_KR_TOURAPI || '';
const KEY = normalizeKey(RAW_KEY);
const BASE = 'https://apis.data.go.kr/B551011/KorService2/areaBasedList2';

const AREAS = (process.env.AREACODES || '1,2,3,4,5,6,7,8,31,32,33,34,35,36,37,38,39').split(',').map(s => s.trim());
const LANGS = (process.env.TOUR_LANGS || 'ko,en').split(',').map(s => s.trim());

async function fetchPage(params) {
  const url = `${BASE}?` + qs({
    serviceKey: KEY,
    _type: 'json',
    MobileOS: 'ETC',
    MobileApp: 'HallyuPass',
    contentTypeId: 12, // 관광지
    ...params
  });
  const j = await fetchJson(url, { label: 'tourapi' });
  const items = j?.response?.body?.items?.item || [];
  return Array.isArray(items) ? items : (items ? [items] : []);
}

async function run() {
  const out = [];
  for (const lang of LANGS) {
    for (const areaCode of AREAS) {
      console.log(`[FETCH] attraction area=${areaCode} lang=${lang}`);
      for (let pageNo = 1; pageNo <= 30; pageNo++) {
        const items = await fetchPage({ areaCode, pageNo, numOfRows: 100, arrange: 'C', lang });
        if (!items.length) break;
        for (const it of items) {
          const ext = String(it.contentid ?? `${it.title ?? ''}|${areaCode}`);
          out.push({
            source: 'tourapi',
            dataset: 'attractions',
            external_id: ext,
            lang,
            payload: it,
            city: it.addr1 ?? null
          });
        }
        if (items.length < 100) break;
        await sleep(120);
      }
      await sleep(250);
    }
  }
  if (out.length) {
    const r = await upsert('raw_sources', out);
    console.log('tourapi attractions saved:', r.count);
  } else {
    console.log('tourapi attractions: no items');
  }
}
run().catch(e => { console.error(e); process.exit(1); });
