// Browser Supabase client (email OTP auth). Returns null when the public env
// vars are missing so the app degrades to GitHub-only auth.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;
let initialised = false;

export function getSupabase(): SupabaseClient | null {
  if (initialised) return client;
  initialised = true;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  client = createClient(url, anon, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
  });
  return client;
}

export function isSupabaseAuthEnabled(): boolean {
  return !!getSupabase();
}
