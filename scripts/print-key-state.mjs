function mask(s){ if(!s) return "(empty)"; const n=s.length; return s[0]+"*".repeat(Math.max(0,n-2))+s[n-1]; }
const raw = process.env.DATA_GO_KR_TOURAPI || "";
let decoded = raw, encoded = raw;
try { decoded = decodeURIComponent(raw); } catch {}
try { encoded = encodeURIComponent(decoded); } catch {}

const info = {
  present: !!raw,
  raw_len: raw.length,
  raw_has_pct: /%/.test(raw),
  raw_has_plus: /\+/.test(raw),
  raw_has_eq: /=/.test(raw),
  raw_head: mask(raw.slice(0,6)),
  decoded_len: decoded.length,
  decoded_has_plus: /\+/.test(decoded),
  decoded_has_eq: /=/.test(decoded),
  encoded_len: encoded.length,
  encoded_has_pct: /%/.test(encoded),
};
console.log(JSON.stringify(info, null, 2));
