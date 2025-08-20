function fp(s){
  if(!s) return {len:0, head:null, tail:null};
  const t = s.trim();
  return { len: t.length, head: t.slice(0,6), tail: t.slice(-6) };
}
const raw = process.env.DATA_GO_KR_TOURAPI || "";
let decoded = raw;
try { decoded = decodeURIComponent(raw); } catch {}
console.log(JSON.stringify({ raw: fp(raw), decoded: fp(decoded) }, null, 2));
