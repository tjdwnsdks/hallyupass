// version: 2025-08-22-01

// Minimal util helpers for TourAPI/KCISA harvesters

// Querystring builder (keeps keys as-is; TourAPI는 serviceKey에 별도 인코딩 불필요)
export function qs(params = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    sp.append(k, String(v));
  }
  return sp.toString();
}

// UTC YYYYMMDD
export function todayYmd(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}

// UTC 기준 days 가산 후 YYYYMMDD
export function plusDaysYmd(days = 0, base = new Date()) {
  const d = new Date(Date.UTC(
    base.getUTCFullYear(),
    base.getUTCMonth(),
    base.getUTCDate()
  ));
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return todayYmd(d);
}

// sleep(ms)
export function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

// fetch JSON with retry, 그리고 오류시 응답 앞부분(head) 첨부
export async function fetchJson(url, opts = {}) {
  const {
    retry = 2,
    minDelayMs = 0,
    timeoutMs = 30000,
  } = opts;

  let lastErr;
  for (let attempt = 0; attempt <= retry; attempt++) {
    const started = Date.now();
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), timeoutMs);

      const r = await fetch(url, { signal: ac.signal });
      clearTimeout(t);

      const text = await r.text();

      // TourAPI/KCISA가 에러 시 XML(soapenv...)로 응답함 → JSON 파싱 전 가드
      if (!r.ok) {
        const err = new Error(`HTTP ${r.status}`);
        err.meta = { status: r.status, head: text.slice(0, 200), url };
        throw err;
      }
      if (text.trim().startsWith('<')) {
        const err = new Error('Non-JSON response');
        err.meta = { status: r.status, head: text.slice(0, 200), url };
        throw err;
      }

      const json = JSON.parse(text);

      // 최소 지연 보장(레이트리밋 회피)
      const spent = Date.now() - started;
      if (minDelayMs > spent) await sleep(minDelayMs - spent);

      return json;
    } catch (e) {
      lastErr = e;
      // 레이트리밋/간헐 오류 백오프
      await sleep(800 * (attempt + 1));
    }
  }
  throw lastErr;
}
