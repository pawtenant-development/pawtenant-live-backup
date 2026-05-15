// useCurrentAdminRole — reads the logged-in admin's doctor_profiles.role so
// the Chats UI can gate admin-only actions (assign to any agent / unassign).
//
// Separate from getAdminIdentity because that helper intentionally stays on
// the lightweight name/email/id shape — adding role there would require
// invalidating every cached identity in the app whenever role permissions
// change. This hook refetches on mount per consumer; role changes rarely.

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export interface CurrentAdminRole {
  user_id: string | null;
  role: string | null;
  loading: boolean;
}

export function useCurrentAdminRole(): CurrentAdminRole {
  const [state, setState] = useState<CurrentAdminRole>({
    user_id: null,
    role: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data?.user?.id ?? null;
        if (!uid) {
          if (!cancelled) setState({ user_id: null, role: null, loading: false });
          return;
        }
        const { data: prof } = await supabase
          .from("doctor_profiles")
          .select("role")
          .eq("user_id", uid)
          .maybeSingle();
        if (cancelled) return;
        const role = (prof as { role?: string | null } | null)?.role ?? null;
        setState({ user_id: uid, role, loading: false });
      } catch {
        if (!cancelled) setState({ user_id: null, role: null, loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
