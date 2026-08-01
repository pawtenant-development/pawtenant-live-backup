// issue-resume-link
//
// ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001 §F / §K
//
// Resume-link issuance for an AUTHENTICATED caller — either admin staff acting
// on a customer's behalf, or the customer who owns the order continuing their
// own booking from the portal.
//
// The admin console used to BUILD recovery links in the browser as
// `…/assessment?resume=<confirmationId>`. That handed staff a permanent,
// copyable credential derived from a display reference — anyone the link was
// forwarded to, and anything that logged the URL, held the same access forever.
//
// An admin browser session cannot hold the service-role key, so it cannot call
// `issue-resume-token` directly. This endpoint is the bridge: it authenticates
// the caller as admin staff, then mints the link through the SAME canonical
// builder (`_shared/resumeLink.ts`) every other producer uses. There is no
// second token-generation implementation anywhere in the codebase.
//
// What the admin gets back is a fresh, expiring, single-use, order-bound link.
// Issuing rotates (auto-revokes) any earlier active token for the same
// (order, purpose) — so a link previously copied out of the console stops
// working the moment a new one is generated, which is the intended policy.
//
// verify_jwt=true. The raw token exists only inside the returned URL: it is
// never logged, never written to audit_logs, and never persisted by this
// function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { issueResumeLink } from "../_shared/resumeLink.ts";
import { consumeRateLimit } from "../_shared/rateLimit.ts";
import { resolveAuditActor } from "../_shared/auditActor.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://www.pawtenant.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Referrer-Policy": "no-referrer",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!bearer) return json({ ok: false, error: "Missing Authorization header" }, 401);

    // Identify the caller from their own JWT — never from the request body.
    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !caller) {
      return json({ ok: false, error: "Authentication failed — please log in again." }, 401);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: profile } = await admin
      .from("doctor_profiles")
      .select("is_admin, role")
      .eq("user_id", caller.id)
      .maybeSingle();

    const isAdmin =
      (profile as { is_admin?: boolean; role?: string } | null)?.is_admin === true ||
      ["owner", "admin_manager", "support"].includes(
        (profile as { role?: string } | null)?.role ?? "",
      );

    // Rate limit per caller. Generous — bulk lead recovery and a customer
    // retrying their own checkout are both legitimate — but it bounds a
    // compromised session harvesting links in a loop.
    if (!(await consumeRateLimit(admin, "issue_admin", caller.id))) {
      return json({ ok: false, error: "Too many link requests — try again shortly." }, 429);
    }

    const body = await req.json() as {
      confirmationId?: string;
      purpose?: string;
      isPsd?: boolean;
      ttlMinutes?: number;
      bridgeStage?: string | null;
      promo?: string | null;
    };

    const confirmationId = (body.confirmationId ?? "").trim();
    if (!confirmationId) return json({ ok: false, error: "confirmationId is required" }, 400);

    // ── Authorization ────────────────────────────────────────────────────────
    // Admin staff may mint for any order. Everyone else may mint ONLY for an
    // order whose email matches their own authenticated identity — the
    // established customer boundary (§K). A provider, or a signed-in customer
    // naming someone else's order, is refused.
    //
    // The refusal is deliberately the SAME generic body whether the order
    // exists or not, so a signed-in customer cannot enumerate confirmation ids.
    if (!isAdmin) {
      const callerEmail = (caller.email ?? "").trim().toLowerCase();
      const { data: ownerRow } = await admin
        .from("orders")
        .select("email")
        .eq("confirmation_id", confirmationId)
        .maybeSingle();
      const orderEmail = ((ownerRow as { email?: string } | null)?.email ?? "")
        .trim()
        .toLowerCase();
      const isOwner = !!callerEmail && !!orderEmail && callerEmail === orderEmail;
      if (!isOwner) {
        return json({ ok: false, code: "not_issuable", error: "This order is not available." }, 403);
      }
    }

    const purpose = body.purpose === "resume_checkout" ? "resume_checkout" : "resume_assessment";

    // Admin-generated links are deliberately SHORTER-lived than the drip's 72 h:
    // staff send them in a live conversation, so 24 h is ample and shrinks the
    // window in which a forwarded link stays usable.
    const ttlMinutes = Math.min(Math.max(body.ttlMinutes ?? 1440, 5), 4320);

    const issued = await issueResumeLink({
      supabaseUrl: SUPABASE_URL,
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      siteUrl: SITE_URL,
      confirmationId,
      isPsd: body.isPsd === true,
      purpose,
      ttlMinutes,
      createdBy: isAdmin
        ? `admin:${(profile as { role?: string } | null)?.role ?? "admin"}`
        : "customer:self-serve",
      bridgeStage: body.bridgeStage ?? null,
      extraParams: body.promo ? { promo: body.promo } : {},
    });

    if (!issued.tokenized) {
      // Order is paid / completed / cancelled / refunded / unknown. Staff get a
      // real explanation (unlike the anonymous endpoints) because they are
      // authenticated and need to know why no link was produced.
      return json({
        ok: false,
        code: "not_issuable",
        error: "This order can no longer be resumed (already paid, completed, cancelled or refunded).",
      }, 200);
    }

    // AUDIT: metadata only. The raw token — and therefore the URL containing it
    // — is deliberately NOT recorded. Audit answers "who minted a credential for
    // which order, when, and until when", never "what was the credential".
    try {
      const actor = await resolveAuditActor(req, admin);
      await admin.from("audit_logs").insert({
        action: "resume_link_issued",
        object_type: "order",
        object_id: confirmationId,
        actor_id: actor.id,
        actor_name: actor.name,
        actor_role: actor.role,
        actor_type: actor.type,
        category: "security",
        description: `${isAdmin ? "Admin" : "Customer"} generated a resume link for ${confirmationId} (expires ${issued.expiresAt ?? "unknown"})`,
        metadata: {
          confirmation_id: confirmationId,
          purpose,
          expires_at: issued.expiresAt,
          ttl_minutes: ttlMinutes,
          source: "issue-resume-link",
          // Never: token, token_hash, url.
        },
      });
    } catch {
      // Audit failure must not deny staff a working link.
    }

    return json({ ok: true, url: issued.url, expiresAt: issued.expiresAt, purpose });
  } catch (err) {
    console.error("[issue-resume-link] error:", err instanceof Error ? err.name : "unknown");
    return json({ ok: false, error: "Unexpected error" }, 500);
  }
});
