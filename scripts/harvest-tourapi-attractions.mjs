import { qs, fetchJson, sleep } from './lib/util.mjs';
import { upsert } from './lib/sb.mjs';

const KEY = process.env.DATA_GO_KR_TOURAPI || process.env.DATA_GO_KR_KEY;
const SVC = process.env.TOURAPI_SVC || 'KorService1';
const BASE = `https://apis.data.go.kr/B551011/${SVC}`;
const AREAS = (process.env.AREACODES || '1').split(',').map(s=>s.trim());
const LANGS = (process.env.TOUR_LANGS || 'ko').split(',').map(s=>s.trim());

function urlAreaList({area,lang,page=1}) {
  return `${BASE}/areaBasedList2?` + qs({
    serviceKey: KEY,
    _type: 'json',
    MobileOS: 'ETC',
    MobileApp: 'HallyuPass',
    contentTypeId: 12,   // 관광지
    areaCode: area,
    numOfRows: 100,
    arrange: 'C',
    pageNo: page,
    lang
  });
}

async function fetchPage(url) {
  const r = await fetch(url);
  const head = await r.text();
  if (!head.trim().startsWith('{')) {
    console.error('Non-JSON head:', head.slice(0,200));
    console.error('URL:', url);
    throw new Error('TourAPI returned non-JSON (likely key-service mismatch or rate limit)');
  }
  const j = JSON.parse(head);
  return j?.response?.body?.items?.item || [];
}

async function run() {
  const out = [];
  for (const lang of LANGS) {
    for (const area of AREAS) {
      console.log(`[FETCH] attraction area=${area} lang=${lang}`);
      let page = 1, loops = 0;
      while (true) {
        const url = urlAreaList({area,lang,page});
        let items = [];
        try {
          items = await fetchPage(url);
        } catch (e) {
          if (++loops <= 2) { await sleep(1500); continue; }
          throw e;
        }
        if (!items.length) break;

        for (const it of items) {
          const ext = String(it.contentid || `${it.title}|${it.addr1||''}`);
          out.push({
            source: 'tourapi',
            dataset: 'attraction',
            external_id: ext,
            lang,
            payload: it,
            city: it.areacode ? String(it.areacode) : null
          });
        }
        if (items.length < 100) break;
        page++;
        await sleep(300);
      }
      await sleep(300);
    }
  }
  if (out.length) {
    const res = await upsert('raw_sources', out);
    console.log('saved attractions:', res.count);
  } else {
    console.log('no attractions rows');
  }
}

run().catch(e => { console.error(e); process.exit(1); });
