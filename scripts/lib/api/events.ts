// src/lib/api/events.ts
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL || ""; // 환경에 맞게 설정

export async function listFestivals(params: { from?: string; to?: string; limit?: number } = {}) {
  const qs = new URLSearchParams({
    select: "id,title,start_date,end_date,image,lat,lng,address",
    type: "eq.festival",
    order: "start_date.asc",
  });
  if (params.from) qs.append("start_date", `gte.${params.from}`);
  if (params.to)   qs.append("end_date",   `lte.${params.to}`);
  if (params.limit) qs.append("limit", String(params.limit));

  const url = `${BASE}/rest/v1/events?${qs.toString()}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`events list HTTP ${res.status}`);
  return res.json();
}

export async function getFestival(id: string) {
  const qs = new URLSearchParams({
    select: "id,title,start_date,end_date,image,lat,lng,address,city,official_url",
    id: `eq.${id}`,
  });
  const url = `${BASE}/rest/v1/events?${qs.toString()}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`event detail HTTP ${res.status}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}
