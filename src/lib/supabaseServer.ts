import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only client using the service-role key. Never import this into a
// client component. RLS is enabled on the table with no policies, so only the
// service role (which bypasses RLS) can read/write challenges.
let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables",
    );
  }

  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}
