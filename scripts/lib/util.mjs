export const sleep = (ms)=>new Promise(r=>setTimeout(r, ms));

export function qs(obj){
  return Object.entries(obj)
    .filter(([,v])=>v!==undefined && v!==null && v!=="")
    .map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

// 키가 이미 %xx 포함이면 재인코딩하지 않음
export function encodeKeyOnce(k){
  if(!k) return "";
  return /%[0-9A-Fa-f]{2}/.test(k) ? k : encodeURIComponent(k);
}

export async function fetchJson(url, {retry=4, minDelayMs=800}={}){
  let lastErr;
  for(let i=0;i<=retry;i++){
    const res = await fetch(url);
    const txt = await res.text();
    if(txt.startsWith("<OpenAPI_ServiceResponse") || txt.includes("<soapenv:Envelope")){
      if(/LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR|22/.test(txt)){
        await sleep(1500*(i+1)); lastErr = new Error("Rate limited");
        lastErr.meta={status:res.status, head:txt.slice(0,200), url}; continue;
      }
      lastErr = new Error("XML error"); lastErr.meta={status:res.status, head:txt.slice(0,200), url};
      await sleep(300*(i+1)); continue;
    }
    try{
      const j = JSON.parse(txt);
      await sleep(minDelayMs);
      return j;
    }catch(e){
      lastErr = new Error("JSON parse failed"); lastErr.meta={status:res.status, head:txt.slice(0,200), url};
      await sleep(600*(i+1)); continue;
    }
  }
  throw lastErr;
}
