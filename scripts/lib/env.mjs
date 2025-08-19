// Single-source env helpers
export function getEnv(name, { required = true } = {}) {
  const v0 = process.env[name];
  if (!v0) {
    if (required) throw new Error(`Missing env: ${name}`);
    return "";
  }
  // strip surrounding quotes and trim
  const v = v0.trim().replace(/^"(.*)"$/,"$1").replace(/^'(.*)'$/,"$1");
  return v;
}

/** Return a *decoded* data.go.kr key. Accepts raw or encoded. Decodes at most once. */
export function getDataGoKrKey(name) {
  const raw = getEnv(name);
  const maybeDecoded = /%[0-9A-Fa-f]{2}/.test(raw) ? decodeURIComponent(raw) : raw;
  return maybeDecoded;
}

/** Basic date helpers */
export function ymd(d = new Date()) {
  return d.toISOString().slice(0,10).replace(/-/g,"");
}
