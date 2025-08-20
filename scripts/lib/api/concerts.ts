// src/lib/api/concerts.ts
// 목적: events 테이블 중 공연/콘서트 전용 조회 유틸
// 전제: Supabase RLS에서 events SELECT 허용, 프런트는 anon 키로만 조회

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!BASE) throw new Error("NEXT_PUBLIC_SUPABASE_URL 누락");
if (!ANON) console.warn("NEXT_PUBLIC_SUPABASE_ANON_KEY 누락. 공개 읽기 실패 가능");

type ConcertRow = {
  id: string;
  type: string;           // "concert" 사용 권장
  title: string | null;
  start_date: string | null; // YYYY-MM-DD
  end_date: string | null;   // YYYY-MM-DD
  city: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  image: string | null;
  official_url?: string | null;
};

type ListParams = {
  from?: string;   // YYYY-MM-DD
  to?: string;     // YYYY-MM-DD
  city?: string;
  limit?: number;
  offset?: number;
  order?: "start_date.asc" | "start_date.desc";
};

function headers() {
  return {
    Accept: "application/json",
    apikey: ANON,
    Authorization: `Bearer ${ANON}`,
  };
}

function buildURL(path: string, q: Record<string, string>) {
  const u = new URL(path.replace(/^\//, ""), BASE + "/");
  u.search = new URLSearchParams(q).toString();
  return u.toString();
}

/** 콘서트 목록 */
export async function listConcerts(params: ListParams = {}): Promise<ConcertRow[]> {
  const q = new URLSearchParams();
  q.set("select", "id,type,title,start_date,end_date,city,address,lat,lng,image,official_url");
  q.set("type", "eq.concert"); // ETL에서 concert 타입으로 적재해야 일관
  q.set("order", params.order || "start_date.asc");
  if (params.from) q.set("start_date", `gte.${params.from}`);
  if (params.to)   q.set("end_date",   `lte.${params.to}`);
  if (params.city) q.set("city",       `eq.${params.city}`);
  if (params.limit)  q.set("limit",  String(params.limit));
  if (params.offset) q.set("offset", String(params.offset));

  const url = `${BASE}/rest/v1/events?${q.toString()}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`listConcerts HTTP ${res.status}`);
  return res.json();
}

/** 콘서트 상세 */
export async function getConcert(id: string): Promise<ConcertRow | null> {
  const q = new URLSearchParams();
  q.set("select", "id,type,title,start_date,end_date,city,address,lat,lng,image,official_url");
  q.set("id", `eq.${id}`);

  const url = `${BASE}/rest/v1/events?${q.toString()}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`getConcert HTTP ${res.status}`);
  const rows = (await res.json()) as ConcertRow[];
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}
