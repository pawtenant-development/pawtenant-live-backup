// src/lib/providerVisibility.ts
//
// AI-SEO-PROVIDER-CANONICAL-DEDUP-AND-EXPANSION-001
//
// FAIL-CLOSED public-visibility contract for provider profiles + the
// environment-separated adapter that lets TEST render deterministically WITHOUT
// ever letting the repository snapshot activate a provider in LIVE production.
//
// A provider may render publicly ONLY when ALL are true:
//   1. it is in the owner-curated approved set        (getPublicProvider !== null)
//   2. authoritative identity is matched              (dbSlug row exists)
//   3. is_active = true                               (live in production)
//   4. is_published = true                            (live in production)
//   5. no exclusion / license-review hold applies     (allowlist + not excluded)
//
// Production (LIVE) reads the LIVE database status and FAILS CLOSED:
//   missing record / failed lookup / inactive / unpublished / mismatch -> hidden.
// TEST uses the snapshot's last-verified status ONLY, gated behind
// isTestProviderEnv(), which defaults to PRODUCTION (false). Because the fallback
// is unreachable unless the running Supabase project is the known TEST project,
// TEST verification data can never silently activate a provider in LIVE.

import { supabase } from "./supabaseClient";
import type { PublicProvider } from "../data/publicProviders";

// Known non-production Supabase project ref. The TEST fallback is reachable ONLY
// when the app is pointed at this exact project; every other environment
// (including LIVE `cvwbozlbbmrjxznknouq` and any preview) falls through to the
// live-status gate. Default = production.
const TEST_SUPABASE_REF = "opudhofjbydrljgleofq";

/**
 * True ONLY in the known TEST Supabase environment. Defaults to false
 * (production / fail-closed) on any error, missing env, or unknown project — so
 * the snapshot-status fallback can never run in LIVE.
 */
export function isTestProviderEnv(): boolean {
  try {
    const url = (import.meta.env?.VITE_PUBLIC_SUPABASE_URL as string | undefined) ?? "";
    return typeof url === "string" && url.includes(TEST_SUPABASE_REF);
  } catch {
    return false;
  }
}

export interface LiveProviderStatus {
  /** An authoritative approved_providers row was found for the dbSlug. */
  found: boolean;
  active: boolean;
  published: boolean;
}

const CLOSED: LiveProviderStatus = { found: false, active: false, published: false };

/**
 * Read the LIVE authoritative active/published status for a curated provider,
 * keyed on its authoritative approved_providers.slug (dbSlug). Fails CLOSED on
 * any error or missing row. Never throws.
 *
 * Status model (mirrors the site's existing rules):
 *   - approved_providers.is_active  -> provider record is active
 *   - doctor_profiles.is_published  -> admin "Published" toggle (public gate)
 *   - doctor_profiles.is_active     -> provider not deactivated
 */
export async function fetchLiveProviderStatus(dbSlug: string): Promise<LiveProviderStatus> {
  try {
    const { data: ap, error: apErr } = await supabase
      .from("approved_providers")
      .select("is_active, email")
      .eq("slug", dbSlug)
      .maybeSingle();
    if (apErr || !ap) return CLOSED;

    const active = ap.is_active === true;
    let published = false;

    const email = (ap.email ?? "").trim();
    if (email) {
      const { data: dp, error: dpErr } = await supabase
        .from("doctor_profiles")
        .select("is_published, is_active")
        .ilike("email", email)
        .maybeSingle();
      if (!dpErr && dp) {
        published = dp.is_published === true && dp.is_active !== false;
      }
    }

    return { found: true, active, published };
  } catch {
    return CLOSED;
  }
}

/**
 * The single visibility decision. In the known TEST environment the snapshot's
 * last-verified status is trusted (deterministic rendering without seeded TEST
 * rows). In every other environment (production/LIVE/preview) the live status
 * governs and the decision fails closed. The env branch is intentionally the
 * ONLY place the snapshot status is read.
 */
export function isProviderPubliclyVisible(
  provider: PublicProvider,
  liveStatus: LiveProviderStatus | null,
): boolean {
  if (isTestProviderEnv()) {
    // TEST-ONLY deterministic fallback. Unreachable in LIVE.
    return provider.snapshotActive === true && provider.snapshotPublished === true;
  }
  // Production / LIVE / preview: authoritative live status, fail-closed.
  if (!liveStatus || liveStatus.found !== true) return false;
  return liveStatus.active === true && liveStatus.published === true;
}
