/**
 * /r/:stage — Recovery click bridge.
 *
 * ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001 §G
 *
 * Recovery SMS / email link to:
 *
 *   /r/<stage>?rt=<secure token>&p=<esa|psd>[&dc=<discountCode>]
 *
 * The bridge exists so a recovery click can be attributed before the visitor
 * reaches the assessment page. It:
 *
 *   1. Reads the token, the route hint and the optional discount code
 *   2. Fires a fire-and-forget recovery_click event — WITHOUT the token
 *   3. Stores a stage-only attribution flag so a later payment_success can fire
 *      recovery_conversion
 *   4. Redirects to /assessment or /psd-assessment carrying the token, using
 *      location.replace so the tokenised /r/ URL never enters history
 *
 * SECURITY NOTES
 *
 * • The token is a CREDENTIAL. It is never written to localStorage, never sent
 *   to analytics, never logged, and never left in a history entry. It is only
 *   ever forwarded, in the query string, to the same-origin page that
 *   immediately exchanges and scrubs it.
 *
 * • `?o=<confirmationId>` is the LEGACY shape. A confirmation id is a display
 *   reference that appears in SMS history, analytics and support threads — it
 *   is not a credential and no longer resumes anything. Such links now land on
 *   the safe "request a new link" screen with no order reference attached.
 *
 * • `p` is a non-authorizing route hint (which assessment page to open). It
 *   reveals nothing: the visitor already knows which product they applied for,
 *   and it unlocks no data on its own.
 *
 * • The destination is always a same-origin RELATIVE path built from a fixed
 *   allowlist — never a URL taken from the query string — so this bridge cannot
 *   be used as an open redirect.
 *
 * ZERO UI. Tracking does not delay the redirect.
 */

import { useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { trackRecoveryClick } from "@/lib/trackEvent";
import { readResumeToken } from "@/lib/resumeTokenParam";

const RECOVERY_FLAG_KEY = "pt_recovery_attribution";

/**
 * Fixed destination allowlist. The route hint selects one of these; it can
 * never introduce a new destination, so no attacker-controlled value reaches
 * window.location.
 */
const DESTINATIONS = {
  esa: "/assessment",
  psd: "/psd-assessment",
} as const;

interface RecoveryFlag {
  stage: string;
  discount_code: string | null;
  clicked_at: string;
}

export default function RecoveryClickBridge(): null {
  const { stage = "" } = useParams<{ stage: string }>();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // The pre-boot inline script already stripped `rt` from the address bar —
    // which is what stops the tag stack reporting it as `dl`, and what makes
    // this page's own URL safe to become the next page's referrer (`dr`).
    const resumeToken  = readResumeToken(searchParams);
    const discountCode = searchParams.get("dc") ?? "";
    const routeHint    = (searchParams.get("p") ?? "").toLowerCase();

    const destPath = routeHint === "psd" ? DESTINATIONS.psd : DESTINATIONS.esa;

    // Persist the recovery touch so a later payment_success can fire
    // recovery_conversion. STAGE ONLY — the confirmation id used to be stored
    // here, and the token must never be. Neither is needed: the conversion is
    // matched on the order the visitor actually pays for.
    try {
      const flag: RecoveryFlag = {
        stage,
        discount_code: discountCode || null,
        clicked_at: new Date().toISOString(),
      };
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(RECOVERY_FLAG_KEY, JSON.stringify(flag));
      }
    } catch { /* ignore */ }

    // Fire recovery_click — fire-and-forget, never throws, never blocks.
    // The order reference is deliberately null: analytics must not receive an
    // order identifier here, and must never receive the token.
    try {
      trackRecoveryClick(stage || "unknown", null, {
        discount_code: discountCode || null,
      });
    } catch { /* ignore */ }

    // Build the destination. Only non-authorizing params are forwarded
    // alongside the token.
    const params = new URLSearchParams();
    if (resumeToken)  params.set("rt", resumeToken);
    if (stage)        params.set("recovery", stage);
    if (discountCode) params.set("dc", discountCode);

    const dest = `${destPath}${params.toString() ? `?${params.toString()}` : ""}`;

    // `replace` so the tokenised /r/ URL does not pollute browser history.
    try {
      window.location.replace(dest);
    } catch {
      try { window.location.href = dest; } catch { /* ignore */ }
    }
  }, [stage, searchParams]);

  return null;
}
