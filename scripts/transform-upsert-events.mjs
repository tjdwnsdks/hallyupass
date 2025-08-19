import crypto from 'node:crypto';
import { selectRawRecent, upsert } from './lib/sb.mjs';

const i32 = (buf)=> buf.readInt32BE(0);
const md5i32 = (s)=> i32(crypto.createHash('md5').update(s).digest());
const toDate = (s)=> s ? String(s).replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3') : (typeof s==='string' ? s.slice(0,10) : null);
const num = (v)=> { const n=Number(v); return Number.isFinite(n)?n:null; };

function mapTourFestival(it){
  return {
    id: Number(it.contentid),
    type: 'festival',
    title: it.title,
    start_date: toDate(it.eventstartdate),
    end_date: toDate(it.eventenddate),
    city: it.addr1 || null,
    lat: num(it.mapy), lng: num(it.mapx),
    address: it.addr1 || '',
    official_url: it.homepage || null,
    seller: null, ticket_options: null,
    tags: ['tourapi','festival'],
    image: it.firstimage || null
  };
}
function inferTypeKCISA(it){
  const s=(it.realmName||'').toLowerCase();
  if(s.includes('공연')||s.includes('뮤지컬')||s.includes('콘서트')||s.includes('music')) return 'concert';
  return 'festival';
}
function mapKcisa(it){
  const key = String(it.cul_id || it.id || `${it.title}|${it.startDate}|${it.place}`);
  const hid = -Math.abs(md5i32(key));
  return {
    id: hid,
    type: inferTypeKCISA(it),
    title: it.title,
    start_date: toDate(it.startDate),
    end_date: toDate(it.endDate),
    city: it.place || null,
    lat: null, lng: null,
    address: it.place || '',
    official_url: it.orgLink || it.url || null,
    seller: null, ticket_options: null,
    tags: ['kcisa', it.realmName || ''],
    image: it.thumbnail || null
  };
}

async function run(){
  const raws = await selectRawRecent(72);
  const events = [];
  for(const r of raws){
    const it = r.payload;
    if(r.source==='tourapi' && r.dataset==='festival' && it?.contentid){ events.push(mapTourFestival(it)); }
    if(r.source==='kcisa' && it?.title){ events.push(mapKcisa(it)); }
    // 숙박/코스는 events 테이블로 넣지 않음(별도 기능에서 참조 예정)
  }
  const uniq = Object.values(events.reduce((a,e)=> (a[e.id]=e, a), {}));
  const res = await upsert('events', uniq);
  console.log('events upserted:', res.count);
}
run().catch(e=>{ console.error(e); process.exit(1); });
