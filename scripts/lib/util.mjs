// scripts/lib/util.mjs
export function todayYmd(d=new Date()){
  const y=d.getUTCFullYear(), m=String(d.getUTCMonth()+1).padStart(2,'0'), day=String(d.getUTCDate()).padStart(2,'0');
  return `${y}${m}${day}`;
}
export function addDaysYmd(days, base=new Date()){
  const d=new Date(base);
  d.setUTCDate(d.getUTCDate()+Number(days||0));
  return todayYmd(d);
}
export const plusDaysYmd = addDaysYmd;
export const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));
export function qs(obj){
  return Object.entries(obj)
    .filter(([,v])=>v!==undefined && v!==null && v!=='')
    .map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}
export async function fetchJson(url){
  const r = await fetch(url);
  const text = await r.text();
  if (!text.trim().startsWith('{')) {
    return { ok:false, status:r.status, head:text, url };
  }
  return { ok:true, json: JSON.parse(text) };
}
