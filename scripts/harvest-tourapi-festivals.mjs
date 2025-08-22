// scripts/harvest-tourapi-festivals.mjs
import { qs, fetchJson, todayYmd, addDaysYmd, sleep, normalizeKey } from './lib/util.mjs';
import { upsert } from './lib/sb.mjs';

const KEY   = normalizeKey(process.env.DATA_GO_KR_TOURAPI || process.env.DATA_GO_KR_KEY || '');
const AHEAD = Number(process.env.DAYS_AHEAD || '60');

let LANGS = String(process.env.TOUR_LANGS || 'ko,en').split(',').map(s=>s.trim()).filter(Boolean);
let AREAS = String(process.env.AREACODES || '1,2,3,4,5,6,7,8,31,32,33,34,35,36,37,38,39')
  .split(',').map(s=>s.trim()).filter(Boolean);

// 테스트 단축용(옵션): 환경변수로 즉시 축소
const MAX_LANGS = Number(process.env.MAX_LANGS || '0');
const MAX_AREAS = Number(process.env.MAX_AREAS || '0');
if (MAX_LANGS > 0) LANGS = LANGS.slice(0, MAX_LANGS);
if (MAX_AREAS > 0) AREAS = AREAS.slice(0, MAX_AREAS);

const BASE = 'https://apis.data.go.kr/B551011/KorService2/searchFestival2';
const NUM  = Number(process.env.ROW_SIZE || '50');

async function fetchPage({ lang, areaCode, start, end, pageNo }) {
  const url = `${BASE}?` + qs({
    serviceKey: KEY, _type: 'json',
    MobileOS: 'ETC', MobileApp: 'HallyuPass',
    eventStartDate: start, eventEndDate: end,
    areaCode, numOfRows: NUM, arrange: 'C', pageNo, lang
  });
  const j = await fetchJson(url, { label: 'tourapi' });
  const body  = j?.response?.body;
  const items = body?.items?.item || [];
  const arr   = Array.isArray(items) ? items : (items ? [items] : []);
  return arr;
}

async function run() {
  const start = todayYmd();
  const end   = addDaysYmd(AHEAD);
  const out   = [];

  for (const lang of LANGS) {
    for (const area of AREAS) {
      console.log(`[FETCH] festivals area=${area} lang=${lang} ${start}-${end}`);
      let page = 1;
      while (true) {
        let arr;
        try {
          arr = await fetchPage({ lang, areaCode: area, start, end, pageNo: page });
        } catch (e) {
          console.warn('[tourapi] fail:', e.message);
          break; // 이 지역/언어는 중단하고 다음으로
        }
        for (const it of arr) {
          out.push({
            source: 'tourapi',
            dataset: 'festivals',
            external_id: String(it.contentid),
            lang,
            payload: it,
            event_start: it.eventstartdate ? String(it.eventstartdate).slice(0,8) : null,
            event_end:   it.eventenddate   ? String(it.eventenddate).slice(0,8)   : null,
            city: it.addr1 || null,
          });
        }
        if (arr.length < NUM) break;
        page += 1;
        await sleep(1000); // 페이지 간
      }
      await sleep(2500);   // 지역 간(레이트리밋 완화)
    }
  }

  if (!out.length) throw new Error('TourAPI: no items (키/쿼터/승인/요청빈도 확인)');
  const r = await upsert('raw_sources', out);
  console.log('tourapi festivals saved:', r.count);
}

run().catch(e => { console.error(e); process.exit(1); });
