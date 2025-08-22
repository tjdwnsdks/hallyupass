// scripts/harvest-kcisa.mjs
import * as UTIL from './lib/util.mjs';
import { upsert } from './lib/sb.mjs';

// util 호환
const qs = UTIL.qs;
const fetchJson = UTIL.fetchJson;
const sleep = UTIL.sleep ?? (ms=>new Promise(r=>setTimeout(r,ms)));

function ymdDash(offsetDays){
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth()+1).padStart(2,'0');
  const day = String(d.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${day}`; // KCISA는 하이픈 포함 YYYY-MM-DD 필요
}

const KEY_RAW = process.env.DATA_GO_KR_KCISA || '';
function normalizeKey(k){
  try { return encodeURIComponent(decodeURIComponent(k)); }
  catch { return encodeURIComponent(k); }
}
const KEY   = normalizeKey(KEY_RAW);
const AHEAD = Number(process.env.DAYS_AHEAD || '60');

// 반드시 소문자 base 우선
const BASES = [
  'https://apis.data.go.kr/B553457/cultureinfo/period2',
  'https://apis.data.go.kr/B553457/cultureinfo/period',
  // KCISA 게이트웨이 폴백
  'https://api.kcisa.kr/openapi/service/rest/cultureinfo/period2',
  'https://api.kcisa.kr/openapi/service/rest/cultureinfo/period',
];

// 문서/게이트웨이별 페이징 파라미터 차이 대응
const PARAM_VARIANTS = [
  (from,to,p)=>({ serviceKey: KEY, _type:'json', from, to, pageNo: p, numOfRows: 50 }),
  (from,to,p)=>({ serviceKey: KEY, _type:'json', from, to, cPage:  p, rows:      50 }),
];

async function tryOnce(base, params){
  const url = `${base}?` + qs(params);
  console.log('[KCISA GET]', url);
  const j = await fetchJson(url, { label:'kcisa' });
  const body = j?.response?.body ?? j?.body ?? j;
  const node = body?.items?.item ?? body?.items ?? body?.item ?? [];
  const items = Array.isArray(node) ? node : (node ? [node] : []);
  return items;
}

async function fetchPage(base, from, to, page){
  for (const build of PARAM_VARIANTS){
    try {
      return await tryOnce(base, build(from,to,page));
    } catch (e){
      const msg = e?.message || '';
      // SOAP Fault/라우팅/정책 실패 등은 다음 variant로 폴백
      console.warn('[KCISA variant failed]', msg || e);
    }
  }
  throw new Error('KCISA: all param variants failed');
}

async function run(){
  const from = ymdDash(0);          // ← 하이픈 포함
  const to   = ymdDash(AHEAD);      // ← 하이픈 포함
  const out  = [];

  for (const base of BASES){
    try {
      for (let p=1; p<=30; p++){
        const items = await fetchPage(base, from, to, p);
        if (!items.length) break;
        for (const it of items){
          const ext = String(it.cul_id ?? it.id ?? `${it.title ?? ''}|${it.startDate ?? ''}|${it.place ?? ''}`);
          out.push({
            source:'kcisa', dataset:'performance', external_id: ext, lang:'ko',
            payload: it,
            event_start: (it.startDate ?? '').slice(0,10) || null,
            event_end:   (it.endDate   ?? '').slice(0,10)   || null,
            city: it.place ?? null,
          });
        }
        if (items.length < 50) break;
        await sleep(300);
      }
      if (out.length) break; // 한 BASE 성공 시 종료
    } catch (e){
      console.warn('[KCISA base failed]', base, e?.message || e);
    }
  }

  if (!out.length) throw new Error('KCISA: no items (키/승인/엔드포인트/기간 확인)');
  const r = await upsert('raw_sources', out);
  console.log('kcisa saved:', r.count);
}

run().catch(e=>{ console.error(e); process.exit(1); });
