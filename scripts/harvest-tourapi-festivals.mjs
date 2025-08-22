import { createClient } from '@supabase/supabase-js';
import { qs, fetchJson, normalizeKey, todayYmd, addDaysYmd, sleep } from './lib/util.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const DAYS_AHEAD = Number(process.env.DAYS_AHEAD || '60');
const LANGS = (process.env.TOUR_LANGS || 'ko').split(',').map(s => s.trim()).filter(Boolean);
const AREAS = (process.env.AREACODES || '1').split(',').map(s => s.trim()).filter(Boolean);
const DELAY = Number(process.env.TOURAPI_DELAY_MS || '1200'); // 호출 간 딜레이(ms)
const PAGES = 3; // 3페이지(최대 300건/요청)

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

function pickItems(json) {
  // TourAPI 표준 JSON
  const items = json?.response?.body?.items?.item ?? [];
  return Array.isArray(items) ? items : [items].filter(Boolean);
}

async function getWithBackoff(url) {
  for (let i = 1; i <= 6; i++) {
    try {
      return await fetchJson(url);
    } catch (e) {
      const head = e.head || '';
      // 레이트리밋 메시지 감지
      if (head.includes('LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR')) {
        const wait = 15000 * i; // 15s, 30s, ...
        console.log(`[tourapi] rate-limited(22). retry #${i} in ${wait}ms :: ${url}`);
        await sleep(wait);
        continue;
      }
      // XML 등 비JSON이면 바로 실패
      throw e;
    }
  }
  throw new Error('tourapi: rate-limit retries exceeded');
}

async function run() {
  const key = normalizeKey(process.env.DATA_GO_KR_TOURAPI || '');
  if (!key) throw new Error('TourAPI: empty DATA_GO_KR_TOURAPI');

  const from = todayYmd();
  const to = addDaysYmd(from, DAYS_AHEAD);

  let collected = 0;

  for (const lang of LANGS) {
    for (const area of AREAS) {
      console.log(`[FETCH] festivals area=${area} lang=${lang} ${from}-${to}`);
      for (let page = 1; page <= PAGES; page++) {
        const base = 'https://apis.data.go.kr/B551011/KorService2/searchFestival2';
        const params = {
          serviceKey: key, _type: 'json',
          MobileOS: 'ETC', MobileApp: 'HallyuPass',
          eventStartDate: from, eventEndDate: to,
          areaCode: area, pageNo: page, numOfRows: 100, arrange: 'C',
          lang
        };
        const url = base + qs(params);

        let json;
        try {
          json = await getWithBackoff(url);
        } catch (e) {
          // 레이트리밋 외의 non-JSON/HTTP 오류는 영역/언어 전환
          console.log('[tourapi] fetch failed:', e.message || e);
          break;
        }

        const items = pickItems(json);
        if (items.length === 0) break; // 다음 지역으로

        // 적재
        const rows = items.map(it => ({
          source: 'tourapi',
          dataset: 'festivals',
          external_id: String(it?.contentid ?? ''),
          lang: lang || null,
          payload: it,
          fetched_at: new Date().toISOString(),
          event_start: null,
          event_end: null,
          city: null
        }));

        const { error } = await sb.from('raw_sources').insert(rows);
        if (error) throw error;

        collected += rows.length;
        // 과도한 호출 방지
        await sleep(DELAY);
      }
      // 지역 간에도 약간 슬립
      await sleep(DELAY);
    }
  }

  if (collected === 0) {
    throw new Error('TourAPI: no items');
  } else {
    console.log(`[TourAPI] inserted ${collected} rows`);
  }
}

run().catch(e => { throw e; });
