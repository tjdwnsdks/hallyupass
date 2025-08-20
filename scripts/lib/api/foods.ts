// src/lib/api/foods.ts
// 목적: food_places 테이블 전용 조회 유틸
// 전제: Supabase RLS에서 food_places SELECT 허용

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!BASE) throw new Error("NEXT_PUBLIC_SUPABASE_URL 누락");
if (!ANON) console.warn("NEXT_PUBLIC_SUPABASE_ANON_KEY 누락. 공개 읽기 실패 가능");

type FoodPlace = {
  id: string;
  name: string | null;
  city: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  tags: string[] | null;        // JSONB 배열 가정
  official_url: string | null;
  image: string | null;
  source_url?: string | null;
};

type FoodListParams = {
  city?: string;
  tag?: string;     // 단일 태그 포함 필터
  limit?: number;
  offset?: number;
  order?: "name.asc" | "name.desc";
};

function headers() {
  return {
    Accept: "application/json",
    apikey: ANON,
    Authorization: `Bearer ${ANON}`,
  };
}

/** 맛집 목록 */
export async function listFoodPlaces(params: FoodListParams = {}): Promise<FoodPlace[]> {
  const q = new URLSearchParams();
  q.set("select", "id,name,city,address,lat,lng,tags,official_url,image,source_url");
  q.set("order", params.order || "name.asc");
  if (params.city) q.set("city", `eq.${params.city}`);
  if (params.tag)  q.set("tags", `cs.{${params.tag}}`); // 배열 포함 검색(PostgREST contains)
  if (params.limit)  q.set("limit",  String(params.limit));
  if (params.offset) q.set("offset", String(params.offset));

  const url = `${BASE}/rest/v1/food_places?${q.toString()}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`listFoodPlaces HTTP ${res.status}`);
  return res.json();
}

/** 맛집 상세 */
export async function getFoodPlace(id: string): Promise<FoodPlace | null> {
  const q = new URLSearchParams();
  q.set("select", "id,name,city,address,lat,lng,tags,official_url,image,source_url");
  q.set("id", `eq.${id}`);

  const url = `${BASE}/rest/v1/food_places?${q.toString()}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`getFoodPlace HTTP ${res.status}`);
  const rows = (await res.json()) as FoodPlace[];
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}
