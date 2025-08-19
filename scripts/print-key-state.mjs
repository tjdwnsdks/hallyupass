import crypto from "node:crypto";
import { getEnv } from "./lib/env.mjs";

function fp(s){ return crypto.createHash("sha256").update(s).digest("hex").slice(0,16); }

const raw = getEnv("DATA_GO_KR_TOURAPI");
const hasPct = /%/.test(raw);
let dec1 = raw;
try { if (/%[0-9A-Fa-f]{2}/.test(raw)) dec1 = decodeURIComponent(raw); } catch {}
const hasPctAfter = /%/.test(dec1);

const info = {
  raw_has_pct: hasPct,
  raw_sample: raw.slice(0,24),
  raw_fp: fp(raw),
  dec1_has_pct: hasPctAfter,
  dec1_sample: dec1.slice(0,24),
  dec1_fp: fp(dec1)
};
console.log(JSON.stringify(info, null, 2));
