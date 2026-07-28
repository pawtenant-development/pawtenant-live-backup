// src/lib/publicProviderDirectory.ts
//
// LIVE-PUBLIC-PAGES-CONVERSION-PRICING-VERIFICATION-HERO-PROVIDER-FIX-001
//
// The ONE public read path for provider publication status + display photo.
//
// Root cause this replaces: the homepage carousel and /our-providers rendered
// src/data/publicProviders.ts directly, with NO live gate at all — so a provider
// the admin had deactivated and unpublished still rendered publicly, and the
// admin-uploaded display photo was never read (hardcoded repo paths only).
//
// Why an RPC and not a table query (see the migration for the verified proof):
//   - doctor_profiles.is_published is the authoritative public gate, but
//     doctor_profiles has no anon SELECT policy (anon reads 0 rows).
//   - approved_providers IS anon-readable, but its policy is USING (true), so
//     querying it from the browser exposes every provider email address.
// get_public_provider_directory() resolves both: it evaluates the gate server
// side and returns only slug / name / photo / NPI.
//
// VISIBILITY CONTRACT
//   render(provider) = inCuratedSet(provider)
//                      AND (directoryLoaded ? publishedLive(provider)
//                                           : snapshotPublished(provider))
//
// The curated set (src/data/publicProviders.ts) supplies EDITORIAL content only
// — normalised state codes, conservative titles, verified NPIs, neutral bios.
// It is NOT the visibility gate and contains no per-provider hide flag. The
// authoritative admin record decides who is visible; a provider disappears
// because Admin marked them inactive/unpublished and for no other reason.
//
// The snapshot seed exists because the SEO prerender uses renderToStaticMarkup,
// which never runs effects and makes no network call — without a synchronous
// seed the prerendered /our-providers body would be empty. The seed is verified
// against LIVE at commit time; the live directory overrides it on the client.

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

/** Public projection returned by get_public_provider_directory(). */
export interface PublicProviderRecord {
  /** approved_providers.slug — matches PublicProvider.dbSlug. */
  slug: string;
  full_name: string;
  /** Admin-uploaded public headshot URL, or null when none is set. */
  photo_url: string | null;
  /** doctor_profiles.npi_number, or null. */
  npi_number: string | null;
}

export interface PublicProviderDirectory {
  /** Keyed by approved_providers.slug (a.k.a. PublicProvider.dbSlug). */
  byDbSlug: ReadonlyMap<string, PublicProviderRecord>;
  /** True once the RPC has resolved (successfully or not). */
  loaded: boolean;
  /** True when the RPC failed — callers keep the verified snapshot seed. */
  failed: boolean;
}

const EMPTY: PublicProviderDirectory = {
  byDbSlug: new Map(),
  loaded: false,
  failed: false,
};

/**
 * Read the public provider directory. Never throws. A failure is reported via
 * `failed` so callers can distinguish "nobody is published" (loaded, empty)
 * from "we could not check" (failed) and keep the verified snapshot rather than
 * blanking the section on a transient network error.
 */
export async function fetchPublicProviderDirectory(): Promise<PublicProviderDirectory> {
  try {
    const { data, error } = await supabase.rpc("get_public_provider_directory");
    if (error || !Array.isArray(data)) {
      return { byDbSlug: new Map(), loaded: true, failed: true };
    }
    const map = new Map<string, PublicProviderRecord>();
    for (const row of data as PublicProviderRecord[]) {
      const key = (row?.slug ?? "").trim().toLowerCase();
      if (key) map.set(key, row);
    }
    return { byDbSlug: map, loaded: true, failed: false };
  } catch {
    return { byDbSlug: new Map(), loaded: true, failed: true };
  }
}

/** React binding for the public provider directory. */
export function usePublicProviderDirectory(): PublicProviderDirectory {
  const [state, setState] = useState<PublicProviderDirectory>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    fetchPublicProviderDirectory().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/** A provider is publicly visible per the contract documented at the top. */
export function isVisibleInDirectory(
  dbSlug: string,
  snapshotPublished: boolean,
  dir: PublicProviderDirectory,
): boolean {
  // Not yet checked, or the check failed → fall back to the commit-time
  // verified snapshot status so prerender/first paint stays populated.
  if (!dir.loaded || dir.failed) return snapshotPublished === true;
  return dir.byDbSlug.has(dbSlug.trim().toLowerCase());
}

/**
 * Resolve the display photo for a provider.
 * Precedence: live admin-uploaded photo → curated repo fallback → null (initials).
 */
export function resolveProviderPhoto(
  dbSlug: string,
  snapshotImage: string | null,
  dir: PublicProviderDirectory,
): string | null {
  const live = dir.byDbSlug.get(dbSlug.trim().toLowerCase())?.photo_url;
  const trimmed = typeof live === "string" ? live.trim() : "";
  if (trimmed) return trimmed;
  return snapshotImage && snapshotImage.trim() ? snapshotImage : null;
}
