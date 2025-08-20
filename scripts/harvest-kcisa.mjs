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

// KCISA 문화행사 데이터 수집
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

async function run() {
  const serviceKey = encodeKeyOnce(process.env.DATA_GO_KR_KCISA);

  const url = `https://apis.data.go.kr/B553457/cultureInfo/openApi?${qs({
    serviceKey,
    _type: 'json',
    numOfRows: 50,
    pageNo: 1
  })}`;

  console.log(`[GET] ${url}`);
  const items = await pagedJson(url, 'response.body.items.item');

  for (const row of items) {
    await supabase.from('raw_sources').insert({
      dataset: 'event',
      source: 'kcisa',
      lang: 'ko',
      contentid: row.CCMA_SEQ,
      raw: row
    }).then(({ error }) => {
      if (error) console.error(error);
    });
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
