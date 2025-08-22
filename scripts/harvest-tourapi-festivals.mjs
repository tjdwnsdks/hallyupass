// scripts/harvest-tourapi-festivals.mjs
import { qs, fetchJson, todayYmd, addDaysYmd, sleep } from './lib/util.mjs';
import { upsert } from './lib/sb.mjs';

const KEY    = process.env.DATA_GO_KR_TOURAPI || '';   // 인코딩 키
const SVC    = process.env.TOURAPI_SVC || 'KorService2';
const BASE   = `https://apis.data.go.kr/B551011/${SVC}`;
const ENDPT  = SVC.endsWith('2') ? 'searchFestival2' : 'searchFestival';

const AHEAD  = Number(process.env.DAYS_AHEAD || '60');
const AREAS  = (process.env.AREACODES || '1,2,3,4,5,6,7,8,31,32,33,34,35,36,37,38,39').split(',').map(s => s.trim());
const LANGS  = (process.env.TOUR_LANGS || 'ko,en').split(',').map(s => s.trim());

async function fetchPage(params) {
  const url = `${BASE}/${ENDPT}?` + qs({
    serviceKey: KEY,
    _type: 'json',
    MobileOS: 'ETC',
    MobileApp: 'HallyuPass',
    ...params
  });
  const res = await fetchJson(url, { expectJson: true, label: 'tourapi' });
  const items = res?.response?.body?.items?.item || [];
  return Array.isArray(items) ? items : (items ? [items] : []);
}

async function run() {
  const eventStartDate = todayYmd();
  const eventEndDate   = addDaysYmd(AHEAD);
  const out = [];

  for (const lang of LANGS) {
    for (const areaCode of AREAS) {
      console.log(`[FETCH] festivals area=${areaCode} lang=${lang} ${eventStartDate}-${eventEndDate}`);
      for (let pageNo = 1; pageNo <= 30; pageNo++) {
        const items = await fetchPage({
          eventStartDate, eventEndDate,
          areaCode,
          numOfRows: 100,
          arrange: 'C',
          pageNo,
          lang
        });
        if (!items.length) break;

        for (const it of items) {
          const ext = String(it.contentid ?? `${it.title ?? ''}|${eventStartDate}|${areaCode}`);
          const es  = it.eventstartdate ? `${it.eventstartdate.slice(0,4)}-${it.eventstartdate.slice(4,6)}-${it.eventstartdate.slice(6,8)}` : null;
          const ee  = it.eventenddate   ? `${it.eventenddate.slice(0,4)}-${it.eventenddate.slice(4,6)}-${it.eventenddate.slice(6,8)}`   : null;
          out.push({
            source: 'tourapi',
            dataset: 'festivals',
            external_id: ext,
            lang,
            payload: it,
            event_start: es,
            event_end: ee,
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
    console.log('tourapi festivals saved:', r.count);
  } else {
    console.log('tourapi festivals: no items');
  }
}

run().catch(e => { console.error(e); process.exit(1); });
