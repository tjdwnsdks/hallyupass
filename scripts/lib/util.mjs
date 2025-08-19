export const qs = (o)=> new URLSearchParams(o).toString();
export const todayYmd = ()=> new Date().toISOString().slice(0,10).replace(/-/g,'');
export const plusDaysYmd = (n)=>{ const d=new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10).replace(/-/g,''); };
export const toDate = (ymd)=> ymd ? String(ymd).replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3') : null;

/** 이미 %XX 가 포함된 키면 재인코딩하지 않음 */
export const encodeKeyOnce = (k)=>{
  if(!k) return '';
  return /%[0-9A-Fa-f]{2}/.test(k) ? k : encodeURIComponent(k);
};

/** 페이지네이션 호출. JSON 실패 시 본문 앞 200자 로그 출력 */
export async function* pagedJson(build, start=1, max=20){
  for(let p=start; p<=max; p++){
    const url = build(p);
    const r = await fetch(url);
    const txt = await r.text();
    try{
      const j = JSON.parse(txt);
      yield j;
    }catch(e){
      console.error('Non-JSON response head:', txt.slice(0,200));
      console.error('URL:', url);
      throw e;
    }
  }
}
