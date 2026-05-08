/**
 * /r/:stage — Recovery click bridge.
 *
 * Phase-3B recovery tracking. Recovery emails / SMS link to:
 *
 *   /r/<stage>?o=<confirmationId>&dc=<discountCode>
 *
 * This component:
 *   1. Reads stage + confirmationId + (optional) discountCode from URL
 *   2. Fires a fire-and-forget recovery_click event (auto-enriched)
 *   3. Stores a localStorage flag so the eventual payment_success can
 *      attribute itself to this recovery touch (recovery_conversion)
 *   4. Redirects to /assessment?resume=<confirmationId>&recovery=<stage>
 *      so the existing resume flow takes over
 *
 * ZERO UI. Tracking does not delay the redirect.
 */

import { useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { trackRecoveryClick } from "@/lib/trackEvent";

const RECOVERY_FLAG_KEY = "pt_recovery_attribution";

interface RecoveryFlag {
  stage: string;
  confirmation_id: string;
  discount_code: string | null;
  clicked_at: string;
}

export default function RecoveryClickBridge(): null {
  const { stage = "" } = useParams<{ stage: string }>();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const confirmationId = searchParams.get("o") ?? "";
    const discountCode   = searchParams.get("dc") ?? "";

    // Best-effort: persist the recovery touch so a later payment_success
    // can fire recovery_conversion linked to this stage. Survives tab close.
    try {
      const flag: RecoveryFlag = {
        stage,
        confirmation_id: confirmationId,
        discount_code: discountCode || null,
        clicked_at: new Date().toISOString(),
      };
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(RECOVERY_FLAG_KEY, JSON.stringify(flag));
      }
    } catch { /* ignore */ }

    // Fire recovery_click — fire-and-forget, never throws, never blocks.
    try {
      trackRecoveryClick(stage || "unknown", confirmationId || null, {
        discount_code: discountCode || null,
      });
    } catch { /* ignore */ }

    // Build the destination. The existing assessment page already handles
    // ?resume=<confirmationId>; we add ?recovery=<stage> so the page can
    // surface the recovery context if needed (and so that referrer
    // analytics can spot it).
    const params = new URLSearchParams();
    if (confirmationId) params.set("resume", confirmationId);
    if (stage)          params.set("recovery", stage);
    if (discountCode)   params.set("dc", discountCode);

    const dest = `/assessment${params.toString() ? `?${params.toString()}` : ""}`;

    // Use replace so the /r URL doesn't pollute browser history.
    try {
      window.location.replace(dest);
    } catch {
      try { window.location.href = dest; } catch { /* ignore */ }
    }
  }, [stage, searchParams]);

  return null;
}
