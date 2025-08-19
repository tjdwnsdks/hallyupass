export const qs = (o)=>new URLSearchParams(o).toString();
export const todayYmd = ()=> new Date().toISOString().slice(0,10).replace(/-/g,'');
export const plusDaysYmd = (n)=>{ const d=new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10).replace(/-/g,''); };
export const toDate = (ymd)=> ymd ? String(ymd).replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3') : null;

export async function* pagedJson(build, start=1, max=20){
  for(let p=start; p<=max; p++){
    const url = build(p);
    const r = await fetch(url);
    if(!r.ok){ console.error('fetch fail', r.status, url); break; }
    const j = await r.json();
    yield j;
  }
}
