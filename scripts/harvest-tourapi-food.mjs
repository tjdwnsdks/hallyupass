// ==== standard header ====
import { qs, pagedJson } from './lib/util.mjs';

// 공공데이터 키 이중 인코딩 1회만
function encodeKeyOnce(raw){
  const key = String(raw ?? '');
  if (/%[0-9A-Fa-f]{2}/.test(key)) return key; // 이미 퍼센트 인코딩이면 그대로
  try { decodeURIComponent(key); } catch {}
  return encodeURIComponent(key);
}
// =========================

// TourAPI 음식점 데이터 수집
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

async function run() {
  const serviceKey = encodeKeyOnce(process.env.DATA_GO_KR_TOURAPI);
  const langs = (process.env.TOUR_LANGS || 'ko').split(',');

  for (const lang of langs) {
    const url = `https://apis.data.go.kr/B551011/KorService1/areaBasedList1?${qs({
      serviceKey,
      MobileOS: 'ETC',
      MobileApp: 'HallyuPass',
      _type: 'json',
      contentTypeId: '39', // 음식점
      areaCode: 1,
      numOfRows: 50,
      pageNo: 1,
      lang
    })}`;

    console.log(`[GET] ${url}`);
    const items = await pagedJson(url, 'response.body.items.item');

    for (const row of items) {
      await supabase.from('raw_sources').insert({
        dataset: 'food',
        source: 'tourapi',
        lang,
        contentid: row.contentid,
        raw: row
      }).then(({ error }) => {
        if (error) console.error(error);
      });
    }
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
