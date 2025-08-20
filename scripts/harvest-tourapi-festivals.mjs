// TourAPI 축제 수집 → raw_sources (REST upsert)
import { qs } from './lib/util.mjs';
import { upsertRaw } from './lib/db.mjs';

// 디코딩/인코딩 키 모두 수용: 결과는 "한 번만 인코딩된 문자열"
function normalizeKey(raw) {
  const k = String(raw ?? '');
  if (/%[0-9A-Fa-f]{2}/.test(k)) return k;     // 이미 퍼센트 포함(인코딩됨)
  try { decodeURIComponent(k); } catch {}
  return encodeURIComponent(k);                // 디코딩키였다면 1회 인코딩
}

// YYYYMMDD UTC
function ymdUTC(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
function plusDaysYmd(n, base = new Date()) {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + Number(n || 0));
  return ymdUTC(d);
}

// serviceKey는 직접 붙이고, 나머지만 qs로 인코딩
function buildUrlWithKey(base, key, params) {
  const rest = qs(params);
  return `${base}?serviceKey=${key}${rest ? `&${rest}` : ''}`;
}

async function fetchPage({key, areaCode, lang, pageNo, startYmd, endYmd}) {
  const base = 'https://apis.data.go.kr/B551011/KorService2/searchFestival2';
  const url = buildUrlWithKey(base, key, {
    _type: 'json',
    MobileOS: 'ETC',
    MobileApp: 'HallyuPass',
    eventStartDate: startYmd,
    eventEndDate:   endYmd,
    areaCode,
    numOfRows: 100,
    arrange: 'C',
    pageNo,
    lang
  });

  console.log('[GET]', url);
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  const txt = await r.text();
  let items = [];
  try {
    const j = JSON.parse(txt);
    items = j?.response?.body?.items?.item || [];
    if (!Array.isArray(items)) items = items ? [items] : [];
  } catch (e) {
    console.error('Non-JSON head:', txt.slice(0,200));
    console.error('URL:', url);
    throw e;
  }
  return items;
}

async function run() {
  const key   = normalizeKey(process.env.DATA_GO_KR_TOURAPI);
  const langs = (process.env.TOUR_LANGS || 'ko').split(',').map(s=>s.trim()).filter(Boolean);
  const areas = (process.env.AREACODES || '1').split(',').map(s=>s.trim()).filter(Boolean);
  const ahead = parseInt(process.env.DAYS_AHEAD || '60', 10);
  const startYmd = ymdUTC();
  const endYmd   = plusDaysYmd(ahead);

  for (const lang of langs) {
    for (const areaCode of areas) {
      console.log(`[FETCH] festivals area=${areaCode} lang=${lang} ${startYmd}-${endYmd}`);
      for (let page=1; page<=20; page++) {
        const items = await fetchPage({key, areaCode, lang, pageNo: page, startYmd, endYmd});
        if (items.length === 0) break;

        for (const it of items) {
          const row = {
            source: 'tourapi',
            dataset: 'festival',
            external_id: String(it.contentid),
            lang,
            payload: it,
            event_start: it.eventstartdate ? `${it.eventstartdate.slice(0,4)}-${it.eventstartdate.slice(4,6)}-${it.eventstartdate.slice(6,8)}` : null,
            event_end:   it.eventenddate   ? `${it.eventenddate.slice(0,4)}-${it.eventenddate.slice(4,6)}-${it.eventenddate.slice(6,8)}`   : null,
            city: it.addr1 || null
          };
          try { await upsertRaw(row); } catch(err) { console.error('upsert error:', err.message); }
        }
        if (items.length < 100) break;
      }
    }
  }
}

run().catch(e => { console.error(e); process.exit(1); });
