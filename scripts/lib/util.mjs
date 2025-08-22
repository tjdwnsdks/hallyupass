// scripts/lib/util.mjs  ← 필요한 경우 보강
export function todayYmd(d=new Date()){
  const z = n=>String(n).padStart(2,'0');
  return `${d.getUTCFullYear()}${z(d.getUTCMonth()+1)}${z(d.getUTCDate())}`;
}
export function addDaysYmd(days){
  const d = new Date();
  d.setUTCDate(d.getUTCDate()+Number(days||0));
  return todayYmd(d);
}
export function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

export function qs(obj){
  const p = new URLSearchParams();
  for(const [k,v] of Object.entries(obj)){
    if(v===undefined || v===null) continue;
    p.append(k, String(v));
  }
  return p.toString();
}

export async function fetchJson(url, {expectJson=true, label=''} = {}){
  const r = await fetch(url);
  const txt = await r.text();
  if(expectJson){
    try { return JSON.parse(txt); }
    catch(e){
      console.error(`Non-JSON head: ${txt.slice(0,180)}`);
      console.error('URL:', url);
      throw new Error((label||'')+' non-JSON');
    }
  }
  return txt;
}
