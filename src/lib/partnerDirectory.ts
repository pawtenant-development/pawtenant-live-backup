/**
 * PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001 — partner id → display name,
 * for ADMIN surfaces only (the main Orders list chip and the origin filter).
 *
 * `partner_organizations` is admin-only under RLS, so a non-admin session
 * simply gets an empty directory and no name is ever shown — the chip is
 * therefore admin-only by construction, not by a UI flag. Loaded once per
 * page lifetime and shared by every card through a module-level cache.
 */
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export type PartnerDirectory = Record<string, string>;

let cache: PartnerDirectory | null = null;
let inflight: Promise<PartnerDirectory> | null = null;
const listeners = new Set<(d: PartnerDirectory) => void>();

async function loadDirectory(): Promise<PartnerDirectory> {
  if (cache) return cache;
  if (!inflight) {
    inflight = (async () => {
      try {
        const { data } = await supabase
          .from("partner_organizations")
          .select("id, display_name")
          .order("display_name");
        const next: PartnerDirectory = {};
        for (const row of (data ?? []) as { id: string; display_name: string | null }[]) {
          next[row.id] = row.display_name ?? "Partner";
        }
        cache = next;
      } catch {
        cache = {};
      }
      listeners.forEach((fn) => fn(cache as PartnerDirectory));
      return cache as PartnerDirectory;
    })();
  }
  return inflight;
}

/** Reset the cache (tests, or after a partner is renamed in Settings). */
export function invalidatePartnerDirectory(): void {
  cache = null;
  inflight = null;
}

export function usePartnerDirectory(enabled: boolean): PartnerDirectory {
  const [dir, setDir] = useState<PartnerDirectory>(() => cache ?? {});
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const onLoad = (d: PartnerDirectory) => { if (alive) setDir(d); };
    listeners.add(onLoad);
    void loadDirectory().then(onLoad);
    return () => { alive = false; listeners.delete(onLoad); };
  }, [enabled]);
  return dir;
}
