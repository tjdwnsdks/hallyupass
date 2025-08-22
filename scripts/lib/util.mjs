// scripts/lib/util.mjs
export function qs(obj = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    // serviceKey는 이미 인코딩되어 있을 수 있으므로 그대로 사용
    if (k === 'serviceKey') { sp.append(k, String(v)); continue; }
    sp.append(k, String(v));
  }
  return sp.toString();
}

export async function fetchJson(url, { retry = 3, minDelayMs = 0 } = {}) {
  let lastErr;
  for (let i = 0; i <= retry; i++) {
    const t0 = Date.now();
    const r = await fetch(url);
    const head = await r.text();
    const stay = Math.max(0, minDelayMs - (Date.now() - t0));
    if (stay) await sleep(stay);

    try {
      const j = JSON.parse(head);
      return j;
    } catch {
      // 비JSON 응답의 헤더(앞부분)와 상태를 meta로 전달
      lastErr = new Error('Non-JSON response');
      lastErr.meta = { status: r.status, head: head.slice(0, 200), url };
      // 22(요청 제한) 같은 경우 재시도
      if (/LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR|SERVICE_KEY_IS_NOT_REGISTERED_ERROR/.test(head)) {
        await sleep(2000 * (i + 1));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr;
}

export function todayYmd() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}

export function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}
