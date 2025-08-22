// scripts/harvest-tourapi-festivals.mjs
import { qs, fetchJson, todayYmd, addDaysYmd, sleep, normalizeKey } from './lib/util.mjs';
import { upsert } from './lib/sb.mjs';

const KEY   = normalizeKey(process.env.DATA_GO_KR_TOURAPI || process.env.DATA_GO_KR_KEY || '');
const AHEAD = Number(process.env.DAYS_AHEAD || '60');
const LANGS = String(process.env.TOUR_LANGS || 'ko,en').split(',').map(s=>s.trim()).filter(Boolean);
const AREAS = String(process.env.AREACODES || '1,2,3,4,5,6,7,8,31,32,33,34,35,36,37,38,39')
                .split(',').map(s=>s.trim()).filter(Boolean);

const BASE = 'https://apis.data.go.kr/B551011/KorService2/searchFestival2';
const NUM  = 50; // row 크기 축소(레이트리밋 완화)

async function fetchPage({ lang, areaCode, start, end, pageNo }) {
  const url = `${BASE}?` + qs({
    serviceKey: KEY, _type: 'json',
    MobileOS: 'ETC', MobileApp: 'HallyuPass',
    eventStartDate: start, eventEndDate: end,
    areaCode, numOfRows: NUM, arrange: 'C', pageNo,
    lang
  });
  const j = await fetchJson(url, { label: 'tourapi' });
  const items = j?.response?.body?.items?.item || [];
  const total = Number(j?.response?.body?.totalCount || 0);
  return { items: Array.isArray(items) ? items : (items ? [items] : []), total };
}

async function run() {
  const start = todayYmd();
  const end   = addDaysYmd(AHEAD);
  const out = [];

  for (const lang of LANGS) {
    for (const area of AREAS) {
      console.log(`[FETCH] festivals area=${area} lang=${lang} ${start}-${end}`);
      let page = 1;
      while (true) {
        let got;
        try {
          got = await fetchPage({ lang, areaCode: area, start, end, pageNo: page });
        } catch (e) {
          // 코드22는 fetchJson 안에서 재시도 함. 여기선 한 번 더 지연 후 다음 area/lang 진행
          console.warn(`[tourapi] fail area=${area} lang=${lang} page=${page} :: ${e.message}`);
          break;
        }

        for (const it of got.items) {
          const ext = String(it.contentid);
          out.push({
            source: 'tourapi',
            dataset: 'festivals',
            external_id: ext,
            lang,
            payload: it,
            event_start: it.eventstartdate ? String(it.eventstartdate).slice(0, 8).replace(/[^0-9]/g,'') : null,
            event_end:   it.eventenddate   ? String(it.eventenddate).slice(0, 8).replace(/[^0-9]/g,'') : null,
            city: it.addr1 || null,
          });
        }

        if (got.items.length < NUM) break;
        page += 1;
        await sleep(500); // 페이지 사이 딜레이
      }
      await sleep(1500); // 지역 사이 딜레이(레이트리밋 완화)
    }
  }

  if (!out.length) throw new Error('TourAPI: no items (키/쿼터/승인 확인 필요)');

  const res = await upsert('raw_sources', out);
  console.log('tourapi festivals saved:', res.count);
}

run().catch(e => { console.error(e); process.exit(1); });
