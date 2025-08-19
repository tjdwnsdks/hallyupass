// 환경변수 헬퍼
export function getEnv(name, { required = true } = {}) {
  const v0 = process.env[name];
  if (!v0) {
    if (required) throw new Error(`Missing env: ${name}`);
    return "";
  }
  // 양끝 따옴표 제거 + trim
  const v = v0.trim().replace(/^"(.*)"$/,"$1").replace(/^'(.*)'$/,"$1");
  return v;
}

/** data.go.kr 키를 최대 1회만 decode하여 디코딩키로 반환 */
export function getDataGoKrKey(name) {
  const raw = getEnv(name);
  const maybeDecoded = /%[0-9A-Fa-f]{2}/.test(raw) ? decodeURIComponent(raw) : raw;
  return maybeDecoded;
}

/** YYYYMMDD */
export function ymd(d = new Date()) {
  return d.toISOString().slice(0,10).replace(/-/g,"");
}
