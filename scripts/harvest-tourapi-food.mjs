// scripts/harvest-tourapi-food.mjs
import { qs, pagedJson } from './lib/util.mjs'; // encodeKeyOnce import 없음
import { createClient } from '@supabase/supabase-js';

// 디코딩키(raw)와 인코딩키(퍼센트 포함) 모두 수용
function normalizeServiceKey(raw) {
  const key = String(raw ?? '');
  // 이미 퍼센트 인코딩 흔적이 있으면 그대로 사용
  if (/%[0-9A-Fa-f]{2}/.test(key)) return key;
  // 디코딩키면 한 번만 인코딩
  try { decodeURIComponent(key); } catch {}
  return encodeURIComponent(key);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

async function run() {
  const serviceKey = normalizeServiceKey(process.env.DATA_GO_KR_TOURAPI);
  const langs = (process.env.TOUR_LANGS || 'ko').split(',').map(s=>s.trim()).filter(Boolean);
  const areas = (process.env.AREACODES || '1').split(',').map(s=>s.trim()).filter(Boolean);

  for (const lang of langs) {
    for (const areaCode of areas) {
      // TourAPI v2 areaBasedList2 + 음식(contentTypeId=39)
      const url = `https://apis.data.go.kr/B551011/KorService2/areaBasedList2?` + qs({
        serviceKey,
        MobileOS: 'ETC',
        MobileApp: 'HallyuPass',
        _type: 'json',
        contentTypeId: '39',
        areaCode,
        numOfRows: '30',
        arrange: 'C',
        pageNo: '1',
        lang,
      });

      console.log('[GET]', url);
      const items = await pagedJson(url, 'response.body.items.item'); // 배열/단일객체 모두 처리

      for (const it of (items || [])) {
        const row = {
          source: 'tourapi',
          dataset: 'food',
          external_id: String(it.contentid),
          lang,
          payload: it,
          event_start: null,
          event_end: null,
          city: it.addr1 || null,
        };
        const { error } = await supabase.from('raw_sources').upsert(row, {
          onConflict: 'source,dataset,external_id,lang',
        });
        if (error) console.error('upsert error:', error.message);
      }
    }
  }
}

run().catch(e => { console.error(e); process.exit(1); });
