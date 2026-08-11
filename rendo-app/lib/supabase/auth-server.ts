import { createClient, type User } from "@supabase/supabase-js";
import {
  getSupabaseServerClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";

export async function getUserFromRequest(request: Request): Promise<User | null> {
  if (!isSupabaseConfigured()) return null;

  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export { getSupabaseServerClient, isSupabaseConfigured };
