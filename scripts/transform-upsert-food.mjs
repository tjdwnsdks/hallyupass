import { selectRawRecent, upsert } from './lib/sb.mjs';
const num = (v)=>{ const n=Number(v); return Number.isFinite(n)?n:null; };

function mapFood(it){
  return {
    id: Number(it.contentid),
    name: it.title,
    city: it.addr1 || null,
    lat: num(it.mapy), lng: num(it.mapx),
    address: it.addr1 || '',
    tags: ['tourapi','food'],
    official_url: it.homepage || null,
    source_url: it.homepage || null,
    image: it.firstimage || null
  };
}

async function run(){
  const raws = await selectRawRecent(72);
  const rows = raws.filter(r=> r.source==='tourapi' && r.dataset==='food' && r.payload?.contentid)
                   .map(r=> mapFood(r.payload));
  const uniq = Object.values(rows.reduce((a,e)=> (a[e.id]=e, a), {}));
  const res = await upsert('food_places', uniq);
  console.log('food_places upserted:', res.count);
}
run().catch(e=>{ console.error(e); process.exit(1); });
