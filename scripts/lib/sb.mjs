// scripts/lib/sb.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
if (!url || !key) throw new Error('Supabase env missing');

const sb = createClient(url, key, { auth: { persistSession: false } });

export async function upsert(table, rows) {
  if (!rows?.length) return { count: 0 };
  const { data, error, count } = await sb.from(table).upsert(rows, { onConflict: 'id' }).select('id', { count: 'exact' });
  if (error) throw error;
  return { data, count: count ?? data?.length ?? 0 };
}
