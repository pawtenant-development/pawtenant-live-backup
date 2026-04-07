/**
 * useAssessmentTracking
 *
 * Captures all traffic attribution data and fires "Assessment Started"
 * events to GHL + GA4 + Meta Pixel on mount.
 *
 * Now delegates all attribution storage to attributionStore — single source
 * of truth for all attribution data across the entire SPA.
 */

import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { fireInitiateCheckout } from "@/lib/metaPixel";
import {
  getAttribution,
  buildFullSource,
  setSelectedState,
  type AttributionData,
} from "@/lib/attributionStore";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;
const GHL_PROXY_URL = `${SUPABASE_URL}/functions/v1/ghl-webhook-proxy`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TrackingData {
  /** Raw ?ref= param value (any string). Use this as the primary source label. */
  ref: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm: string;
  utmContent: string;
  gclid: string;
  fbclid: string;
  fbc: string;
  sessionId: string;
  firstSeenAt: string;
  /**
   * Human-readable source label for display/storage.
   * Priority: ref > gclid > fbclid > utm_source > referrer > "Direct"
   */
  fullSource: string;
  landingUrl: string;
  referrer: string;
  /** Full attribution snapshot — use this for attribution_json DB field */
  attribution: AttributionData;
}

// ── captureTrackingData ───────────────────────────────────────────────────────

/**
 * Reads all tracking params from the attribution store.
 * Call this anywhere — safe to call outside of hooks.
 * The store is already populated by UTMCapture in App.tsx.
 */
export function captureTrackingData(_searchParams?: URLSearchParams): TrackingData {
  const data = getAttribution();
  const fullSource = buildFullSource();

  return {
    ref:          data.ref ?? "",
    utmSource:    data.utm_source ?? "",
    utmMedium:    data.utm_medium ?? "",
    utmCampaign:  data.utm_campaign ?? "",
    utmTerm:      data.utm_term ?? "",
    utmContent:   data.utm_content ?? "",
    gclid:        data.gclid ?? "",
    fbclid:       data.fbclid ?? "",
    fbc:          data.fbc ?? "",
    sessionId:    data.session_id,
    firstSeenAt:  data.first_seen_at ?? "",
    fullSource,
    landingUrl:   data.landing_url ?? "",
    referrer:     data.referrer ?? "",
    attribution:  data,
  };
}

// ── Main Hook ─────────────────────────────────────────────────────────────────

interface UseAssessmentTrackingOptions {
  /** "esa" or "psd" — used in the event payload and dedup key */
  letterType: "esa" | "psd";
  /**
   * Set true when resuming an existing order (e.g. ?resume=PT-XXXX).
   * Skips the "Assessment Started" event so we don't double-count.
   */
  isResume?: boolean;
}

/**
 * Call once at the top of your assessment page component.
 * Returns TrackingData for use in webhooks/Supabase saves.
 * Fires "Assessment Started" events on mount (deduped per session).
 */
export function useAssessmentTracking({
  letterType,
  isResume = false,
}: UseAssessmentTrackingOptions): TrackingData {
  const [searchParams] = useSearchParams();

  // Sync ?state= param into the attribution store
  useEffect(() => {
    const stateParam = searchParams.get("state");
    if (stateParam) setSelectedState(stateParam);
  }, [searchParams]);

  const tracking = captureTrackingData(searchParams);

  useEffect(() => {
    // Skip for resume flows — user already started before
    if (isResume) return;

    // Dedup: only fire once per browser session per letter type
    const dedupKey = `pt_start_fired_${letterType}`;
    if (sessionStorage.getItem(dedupKey)) return;
    sessionStorage.setItem(dedupKey, "1");

    const letterLabel = letterType === "psd" ? "PSD" : "ESA";

    const fireStartEvents = async () => {
      // ── 1. GHL: "Assessment Started" event ──────────────────────────────
      try {
        await fetch(GHL_PROXY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({
            webhookType: "assessment_start",
            letterType: letterLabel,
            leadStatus: `Assessment Started – ${letterLabel}`,
            trafficSource: tracking.fullSource,
            ref: tracking.ref,
            utmSource: tracking.utmSource,
            utmMedium: tracking.utmMedium,
            utmCampaign: tracking.utmCampaign,
            gclid: tracking.gclid,
            fbclid: tracking.fbclid,
            sessionId: tracking.sessionId,
            firstSeenAt: tracking.firstSeenAt,
            landingUrl: tracking.landingUrl,
            submittedAt: new Date().toISOString(),
            tags: [
              `${letterLabel} Assessment`,
              "Assessment Started",
              ...(tracking.ref ? [`Ref: ${tracking.ref}`] : []),
              ...(tracking.fullSource !== "Direct" ? [`Source: ${tracking.fullSource}`] : []),
            ],
          }),
        });
      } catch {
        // Silent — never block the user
      }

      // ── 2. GA4: custom event ─────────────────────────────────────────────
      if (typeof window.gtag === "function") {
        window.gtag("event", "begin_assessment", {
          letter_type: letterLabel,
          traffic_source: tracking.fullSource,
          ref_param: tracking.ref || undefined,
          utm_source: tracking.utmSource || undefined,
          utm_campaign: tracking.utmCampaign || undefined,
          session_id: tracking.sessionId,
        });
      }

      // ── 3. Meta Pixel: InitiateCheckout event ──────────────────────────────
      fireInitiateCheckout({
        content_name: `${letterLabel} Assessment Started`,
      });
    };

    fireStartEvents();
  // Only run on mount — tracking params don't change mid-session
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letterType, isResume]);

  return tracking;
}
