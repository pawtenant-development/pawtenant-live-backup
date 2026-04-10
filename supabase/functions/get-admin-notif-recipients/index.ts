import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * get-admin-notif-recipients
 *
 * Resolves the correct email recipients for a given admin notification key.
 * Priority chain (NO automatic appending — each tier is exclusive unless fallback is explicitly set):
 *   1. per_notif_emails (specific to this notification key) — uses ONLY these recipients
 *   2. group_emails (shared across all notifications in the same group) — uses ONLY these
 *   3. global fallback email (stored in _global_settings row, or ADMIN_EMAIL env var)
 *
 * The fallback email is NOT automatically appended to specific/group recipients.
 * It is only used as a standalone fallback when neither specific nor group emails exist.
 *
 * Returns: { enabled, recipients: string[], fallbackEmail: string, source }
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NOTIF_GROUP_MAP: Record<string, string> = {
  new_paid_order: "Orders",
  unpaid_lead: "Orders",
  order_under_review: "Orders",
  order_completed: "Orders",
  order_cancelled: "Orders",
  refund_issued: "Orders",
  provider_application: "Providers",
  provider_license_change: "Providers",
  provider_letter_submitted: "Providers",
  provider_rejected_order: "Providers",
  renewal_reminder_sent: "Renewals & Follow-ups",
  checkout_recovery_sent: "Renewals & Follow-ups",
  system_health_alert: "System",
  payout_reminder: "System",
};

const NOTIF_DEFAULT_ENABLED: Record<string, boolean> = {
  new_paid_order: true,
  unpaid_lead: true,
  order_under_review: false,
  order_completed: true,
  order_cancelled: true,
  refund_issued: true,
  provider_application: true,
  provider_license_change: true,
  provider_letter_submitted: false,
  provider_rejected_order: true,
  renewal_reminder_sent: false,
  checkout_recovery_sent: false,
  system_health_alert: true,
  payout_reminder: true,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function dedupeEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  return emails
    .map((e) => e.toLowerCase().trim())
    .filter((e) => {
      if (!e || seen.has(e)) return false;
      seen.add(e);
      return true;
    });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { notificationKey?: string };
  try {
    body = await req.json() as { notificationKey?: string };
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { notificationKey } = body;
  if (!notificationKey) {
    return json({ error: "notificationKey is required" }, 400);
  }

  const group = NOTIF_GROUP_MAP[notificationKey];
  const defaultEnabled = NOTIF_DEFAULT_ENABLED[notificationKey] ?? true;
  const envFallback = Deno.env.get("ADMIN_EMAIL") ?? "eservices.dm@gmail.com";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: allPrefs, error } = await supabase
    .from("admin_notification_prefs")
    .select("user_id, notification_key, enabled, email_override, group_emails, per_notif_emails")
    .order("updated_at", { ascending: false });

  if (error || !allPrefs || allPrefs.length === 0) {
    console.warn("[get-admin-notif-recipients] No prefs found, using env fallback:", envFallback);
    return json({
      enabled: defaultEnabled,
      recipients: [envFallback],
      fallbackEmail: envFallback,
      source: "env_fallback",
      notificationKey,
      group,
    });
  }

  // Use the most recently updated admin's prefs
  const userIds = [...new Set(allPrefs.map((p: { user_id: string }) => p.user_id))];
  const primaryUserId = userIds[0];
  const userPrefs = allPrefs.filter((p: { user_id: string }) => p.user_id === primaryUserId);

  // Find the specific notification pref
  const specificPref = userPrefs.find((p: { notification_key: string }) => p.notification_key === notificationKey);
  const isEnabled = specificPref ? specificPref.enabled : defaultEnabled;

  // Read global fallback email from the dedicated _global_settings row
  // This is saved by the frontend when the user sets the "Default Fallback Email"
  const globalSettingsPref = userPrefs.find((p: { notification_key: string }) => p.notification_key === "_global_settings");
  const globalFallbackEmail = globalSettingsPref?.email_override ?? envFallback;

  // ── STEP 1: Check per_notif_emails (specific override) ──────────────────
  // These are the ONLY recipients — fallback is NOT appended
  const perNotifEmails: string[] = Array.isArray(specificPref?.per_notif_emails)
    ? specificPref.per_notif_emails.filter(Boolean)
    : [];

  if (perNotifEmails.length > 0) {
    return json({
      enabled: isEnabled,
      recipients: dedupeEmails(perNotifEmails),
      fallbackEmail: globalFallbackEmail,
      source: "specific",
      notificationKey,
      group,
    });
  }

  // ── STEP 2: Check group_emails ───────────────────────────────────────────
  // These are the ONLY recipients — fallback is NOT appended
  if (group) {
    const groupPrefs = userPrefs.filter(
      (p: { notification_key: string }) => NOTIF_GROUP_MAP[p.notification_key] === group
    );
    const groupEmailSet = new Set<string>();
    groupPrefs.forEach((p: { group_emails: string[] | null }) => {
      (p.group_emails ?? []).forEach((e: string) => {
        const trimmed = e.toLowerCase().trim();
        if (trimmed) groupEmailSet.add(trimmed);
      });
    });
    const groupEmails = Array.from(groupEmailSet);

    if (groupEmails.length > 0) {
      return json({
        enabled: isEnabled,
        recipients: groupEmails,
        fallbackEmail: globalFallbackEmail,
        source: "group",
        notificationKey,
        group,
      });
    }
  }

  // ── STEP 3: Global fallback only ─────────────────────────────────────────
  return json({
    enabled: isEnabled,
    recipients: dedupeEmails([globalFallbackEmail]),
    fallbackEmail: globalFallbackEmail,
    source: "global",
    notificationKey,
    group,
  });
});
