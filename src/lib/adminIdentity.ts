// Admin identity helper used by the chat assignment UI.
//
// Pulls the logged-in admin's auth user id, email, and full name so the
// ChatsTab + MiniChatPanel can call the assign / resolve RPCs without
// threading props from AdminApp. Cached in-memory for the tab lifetime —
// the values don't change mid-session.

import { supabase } from "./supabaseClient";

export interface AdminIdentity {
  /** auth user id — stored in chat_sessions.assigned_admin_id */
  id: string | null;
  email: string | null;
  name: string | null;
}

let cache: AdminIdentity | null = null;
let inflight: Promise<AdminIdentity> | null = null;

export async function getAdminIdentity(): Promise<AdminIdentity> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session?.user) {
        return { id: null, email: null, name: null };
      }
      let name: string | null = null;
      let email: string | null = session.user.email ?? null;
      try {
        const { data: prof } = await supabase
          .from("doctor_profiles")
          .select("full_name, email")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (prof) {
          const p = prof as { full_name?: string | null; email?: string | null };
          name  = p.full_name ?? null;
          email = p.email ?? email;
        }
      } catch {
        // silent — admin can still assign using just the auth user id/email
      }
      const out: AdminIdentity = {
        id: session.user.id,
        email,
        name,
      };
      cache = out;
      return out;
    } catch {
      return { id: null, email: null, name: null };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function clearAdminIdentityCache(): void {
  cache = null;
}
