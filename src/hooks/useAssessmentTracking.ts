/**
 * useAssessmentTracking
 *
 * Captures all traffic attribution data (?ref=, UTMs, gclid, fbclid)
 * and fires "Assessment Started" events to GHL + Google Sheets on mount.
 *
 * ?ref= accepts ANY value — no whitelist.
 * Examples of valid values:
 *   ?ref=fb-june-promo
 *   ?ref=google-brand-campaign
 *   ?ref=tiktok-influencer-sarah
 *   ?ref=email-blast-july4
 *   ?ref=sms-promo-1
 */

import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { fireInitiateCheckout } from "@/lib/metaPixel";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;
const GHL_PROXY_URL = `${SUPABASE_URL}/functions/v1/ghl-webhook-proxy`;

// REMOVED: GOOGLE_SHEETS_WEBHOOK_URL and SHEETS_SECRET are no longer called
// from the browser. All Sheets syncing is handled exclusively by the
// sync-to-sheets edge function to keep secrets out of the client bundle.

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
  /**
   * Human-readable source label for display/storage.
   * Priority: ref > gclid > fbclid > utm_source > referrer > "Direct"
   */
  fullSource: string;
  landingUrl: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildFullSource(
  ref: string,
  utmSource: string,
  utmMedium: string,
  gclid: string,
  fbclid: string,
  referrer: string,
): string {
  if (ref) return ref; // ?ref= always wins — this is your custom label
  if (gclid) return "Google Ads";
  if (fbclid) return "Facebook / Instagram Ads";
  if (utmSource && utmMedium) return `${utmSource} / ${utmMedium}`;
  if (utmSource) return utmSource;
  if (referrer) {
    try {
      const host = new URL(referrer).hostname;
      if (host.includes("google")) return "Google Organic";
      if (host.includes("bing")) return "Bing Organic";
      if (host.includes("facebook") || host.includes("instagram")) return "Facebook Organic";
      if (host.includes("tiktok")) return "TikTok";
      if (host.includes("twitter") || host.includes("t.co")) return "Twitter / X";
      if (host.includes("youtube")) return "YouTube";
      if (host.includes("linkedin")) return "LinkedIn";
      return `Referral: ${host}`;
    } catch {
      return referrer;
    }
  }
  return "Direct";
}

/**
 * Reads all tracking params from URL + sessionStorage.
 * Call this anywhere — safe to call outside of hooks.
 */
export function captureTrackingData(searchParams: URLSearchParams): TrackingData {
  // ?ref= accepts ANY string — no whitelist restriction
  const refFromUrl = searchParams.get("ref")?.trim() ?? "";
  const ref = refFromUrl || sessionStorage.getItem("esa_referred_by") || "";

  const utmSource = searchParams.get("utm_source") || sessionStorage.getItem("utm_source") || "";
  const utmMedium = searchParams.get("utm_medium") || sessionStorage.getItem("utm_medium") || "";
  const utmCampaign = searchParams.get("utm_campaign") || sessionStorage.getItem("utm_campaign") || "";
  const utmTerm = searchParams.get("utm_term") || sessionStorage.getItem("utm_term") || "";
  const utmContent = searchParams.get("utm_content") || sessionStorage.getItem("utm_content") || "";
  const gclid = searchParams.get("gclid") || sessionStorage.getItem("gclid") || "";
  const fbclid = searchParams.get("fbclid") || sessionStorage.getItem("fbclid") || "";
  const referrer = sessionStorage.getItem("referrer") || document.referrer;
  const landingUrl = sessionStorage.getItem("landing_url") || window.location.href;

  // Persist ref so it survives navigation within the SPA
  if (refFromUrl) sessionStorage.setItem("esa_referred_by", refFromUrl);

  const fullSource = buildFullSource(ref, utmSource, utmMedium, gclid, fbclid, referrer);

  return {
    ref,
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    utmContent,
    gclid,
    fbclid,
    fullSource,
    landingUrl,
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
      // Creates a GHL contact event so you can see source-level start counts.
      // No PII — fires before the user fills in any personal info.
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

      // NOTE: Google Sheets assessment_start events removed — they were
      // creating blank rows (no personal data) polluting the leads sheet.
      // Full sync fires automatically after each lead is saved instead.

      // ── 2. GA4: custom event ─────────────────────────────────────────────
      if (typeof window.gtag === "function") {
        window.gtag("event", "begin_assessment", {
          letter_type: letterLabel,
          traffic_source: tracking.fullSource,
          ref_param: tracking.ref || undefined,
          utm_source: tracking.utmSource || undefined,
          utm_campaign: tracking.utmCampaign || undefined,
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
