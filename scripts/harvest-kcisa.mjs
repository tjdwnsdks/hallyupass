// KCISA 공연·전시·행사 → raw_sources(dataset: 'performance')
// - supabase-js 사용 안 함
// - 인코딩(Encoding) 키를 serviceKey에 그대로 붙임
import { qs } from './lib/util.mjs';
import { upsertRaw } from './lib/db.mjs';

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

// serviceKey는 절대 인코딩/디코딩하지 않고 그대로 붙임
function buildUrl(base, rawKey, params) {
  const rest = qs(params);
  return `${base}?serviceKey=${rawKey}${rest ? `&${rest}` : ''}`;
}

async function run() {
  const key = process.env.DATA_GO_KR_KCISA; // 인코딩 키
  const ahead = parseInt(process.env.DAYS_AHEAD || '60', 10);
  const from = ymdUTC();
  const to = plusDaysYmd(ahead);
  const base = 'https://apis.data.go.kr/B553457/cultureInfo/period2';

  for (let page = 1; page <= 20; page++) {
    const url = buildUrl(base, key, {
      _type: 'json',
      from,
      to,
      cPage: page,
      rows: 50
    });

    console.log('[GET kcisa]', url);
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    const text = await r.text();

    let items = [];
    try {
      const j = JSON.parse(text);
      // KCISA 응답 포맷 방어적 파싱
      items = j?.response?.body?.items || j?.response?.body?.item || j?.items || [];
      if (!Array.isArray(items)) items = items ? [items] : [];
    } catch (e) {
      console.error('KCISA non-JSON head:', text.slice(0, 200));
      console.error('URL:', url);
      throw e;
    }

    if (items.length === 0) break;

    for (const it of items) {
      const ext = String(it.cul_id || it.id || `${it.title || ''}|${it.startDate || ''}|${it.place || ''}`);
      try {
        await upsertRaw({
          source: 'kcisa',
          dataset: 'performance',
          external_id: ext,
          lang: 'ko', // KCISA 기본 한글
          payload: it,
          event_start: it.startDate?.slice(0, 10) || null,
          event_end: it.endDate?.slice(0, 10) || null,
          city: it.place || null
        });
      } catch (err) {
        console.error('upsert error:', err.message);
      }
    }

    if (items.length < 50) break; // 마지막 페이지 추정
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
