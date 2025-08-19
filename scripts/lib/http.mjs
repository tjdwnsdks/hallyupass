import { setTimeout as sleep } from "node:timers/promises";

/** BASE의 경로를 보존하며 PATH를 이어 붙입니다. */
export function buildUrl(base, path, params) {
  const u = new URL(base);
  const basePath = u.pathname.replace(/\/+$/,"");      // 끝 슬래시 제거
  const addPath  = String(path ?? "").replace(/^\/+/,""); // 앞 슬래시 제거
  u.pathname = [basePath, addPath].filter(Boolean).join("/");
  const qs = new URLSearchParams(params ?? {});
  u.search = qs.toString();
  return u.toString();
}

/** GET + 재시도 + 프리뷰 로그 */
export async function getWithPreview(url, { retries = 3, timeoutMs = 20000 } = {}) {
  let lastErr, bodyBuf, res;
  for (let i=0;i<retries;i++){
    try{
      const ctl = new AbortController();
      const t = setTimeout(()=>ctl.abort(), timeoutMs);
      res = await fetch(url, { signal: ctl.signal, redirect: "follow" });
      clearTimeout(t);
      bodyBuf = Buffer.from(await res.arrayBuffer());
      const head = bodyBuf.subarray(0, 2048).toString();
      const ctype = res.headers.get("content-type") || "";
      const info = {
        status: res.status,
        statusText: res.statusText,
        contentType: ctype,
        rateRemain: res.headers.get("x-ratelimit-remaining"),
        head,
      };
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { info });
      return { res, bodyBuf, info };
    }catch(e){
      lastErr = e;
      const backoff = Math.min(2000*(2**i), 8000);
      if (i < retries-1) await sleep(backoff);
    }
  }
  if (lastErr?.info) throw new Error(`RequestFailed: ${url}\n${JSON.stringify(lastErr.info,null,2)}`);
  throw new Error(`RequestFailed: ${url} :: ${lastErr?.message || "unknown"}`);
}

/** JSON 파싱. 비JSON이면 미리보기 포함 에러 */
export function parseJsonOrThrow(bodyBuf, contentType) {
  if (!/json/i.test(contentType)) {
    const head = bodyBuf.subarray(0, 512).toString();
    throw new Error(`NonJSON content-type=${contentType} head=${head}`);
  }
  try {
    return JSON.parse(bodyBuf.toString("utf8"));
  } catch (e) {
    const head = bodyBuf.subarray(0, 256).toString();
    throw new Error(`JSONParseError head=${head}`);
  }
}
