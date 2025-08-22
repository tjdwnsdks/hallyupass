import { qs, fetchJson, todayYmd, addDaysYmd, sleep } from './lib/util.mjs';
import { upsert } from './lib/sb.mjs';

const KEY = process.env.DATA_GO_KR_TOURAPI || process.env.DATA_GO_KR_KEY;
const SVC = process.env.TOURAPI_SVC || 'KorService1'; // KorService1로 기본
const BASE = `https://apis.data.go.kr/B551011/${SVC}`;
const AHEAD = Number(process.env.DAYS_AHEAD || '60');
const AREAS = (process.env.AREACODES || '1').split(',').map(s=>s.trim());
const LANGS = (process.env.TOUR_LANGS || 'ko').split(',').map(s=>s.trim());

function urlSearchFestival({from,to,area,lang,page=1}) {
  return `${BASE}/searchFestival2?` + qs({
    serviceKey: KEY,
    _type: 'json',
    MobileOS: 'ETC',
    MobileApp: 'HallyuPass',
    eventStartDate: from,
    eventEndDate: to,
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
  // JSON이 아니면 오류 본문 노출
  if (!head.trim().startsWith('{')) {
    console.error('Non-JSON head:', head.slice(0,200));
    console.error('URL:', url);
    throw new Error('TourAPI returned non-JSON (likely key-service mismatch or rate limit)');
  }
  const j = JSON.parse(head);
  return j?.response?.body?.items?.item || [];
}

async function run() {
  const from = todayYmd();
  const to = addDaysYmd(AHEAD);
  const out = [];

  for (const lang of LANGS) {
    for (const area of AREAS) {
      console.log(`[FETCH] festivals area=${area} lang=${lang} ${from}-${to} svc=${SVC}`);
      let page = 1, loops = 0;
      while (true) {
        const url = urlSearchFestival({from,to,area,lang,page});
        let items = [];
        try {
          items = await fetchPage(url);
        } catch (e) {
          // 2~3회 재시도 후 패스
          if (++loops <= 2) {
            await sleep(1500);
            continue;
          }
          throw e;
        }
        if (!items.length) break;

        for (const it of items) {
          const ext = String(it.contentid || `${it.title}|${it.eventstartdate||''}|${it.addr1||''}`);
          out.push({
            source: 'tourapi',
            dataset: 'festival',
            external_id: ext,
            lang,
            payload: it,
            event_start: (it.eventstartdate||'').slice(0,8)?.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3') || null,
            event_end: (it.eventenddate||'').slice(0,8)?.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3') || null,
            city: it.areacode ? String(it.areacode) : null
          });
        }
        if (items.length < 100) break;
        page++;
        await sleep(300); // 속도 완화
      }
      await sleep(300);
    }
  }

  if (out.length) {
    const res = await upsert('raw_sources', out);
    console.log('saved festivals:', res.count);
  } else {
    console.log('no festivals rows');
  }
}

run().catch(e => { console.error(e); process.exit(1); });
