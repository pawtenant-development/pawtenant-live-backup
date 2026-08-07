import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkPsdAssessmentComplete } from "../_shared/psdCompletionGate.ts";
import { logEmailComm } from "../_shared/logEmailComm.ts";
import { notifyProviderAdditionalDoc } from "../_shared/notifyProviderAdditionalDoc.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-assign-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const HEADER_BG = "#4a9e8a";
const HEADER_SUB = "rgba(255,255,255,0.82)";
const ACCENT = "#1a5c4f";
const ORANGE = "#f97316";
const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

interface AdditionalDocRequest {
  types?: string[];
  otherDescription?: string;
}

type EmailLogEntry = { type: string; sentAt: string; to: string; success: boolean };

async function appendEmailLog(supabase: ReturnType<typeof createClient>, confirmationId: string, entries: EmailLogEntry[]): Promise<void> {
  try {
    const { data } = await supabase.from("orders").select("email_log").eq("confirmation_id", confirmationId).maybeSingle();
    const currentLog: EmailLogEntry[] = (data?.email_log as EmailLogEntry[]) ?? [];
    await supabase.from("orders").update({ email_log: [...currentLog, ...entries] }).eq("confirmation_id", confirmationId);
  } catch (err) { console.warn("[assign-doctor] email_log update failed:", err); }
}

async function sendViaResend(opts: { to: string; subject: string; html: string; fromName?: string }): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.error("[assign-doctor] RESEND_API_KEY secret is not set"); return false; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${opts.fromName ?? "PawTenant"} <hello@pawtenant.com>`, to: [opts.to], subject: opts.subject, html: opts.html }),
    });
    if (!res.ok) { const errBody = await res.text(); console.error(`[assign-doctor] Resend error ${res.status}: ${errBody}`); return false; }
    return true;
  } catch (err) { console.error("[assign-doctor] Resend fetch error:", err); return false; }
}

async function sendProviderEmail(opts: {
  providerEmail: string; providerName: string; patientFirstName: string; patientLastName: string;
  patientEmail: string; patientPhone: string; patientState: string; confirmationId: string;
  portalUrl: string; additionalDocs?: AdditionalDocRequest | null; isPSD?: boolean;
}): Promise<boolean> {
  const extraDocs = opts.additionalDocs?.types?.filter((t) => t !== "ESA Letter" && t !== "PSD Letter") ?? [];
  const hasExtraDocs = extraDocs.length > 0;
  const letterTypeLabel = opts.isPSD ? "PSD Letter" : "ESA Letter";
  const portalLabel = opts.isPSD ? "PSD Provider Portal" : "ESA Provider Portal";

  const additionalDocsHtml = hasExtraDocs ? `<tr><td style="padding:14px 24px;border-top:1px solid #e5e7eb;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:14px 18px;"><tr><td><p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.08em;">Additional Documents Requested</p><p style="margin:0 0 8px;font-size:13px;color:#78350f;">This patient has requested the following additional documentation:</p><ul style="margin:0 0 8px;padding-left:16px;">${extraDocs.map((doc) => `<li style="font-size:13px;color:#78350f;font-weight:600;margin-bottom:4px;">${doc}</li>`).join("")}</ul>${opts.additionalDocs?.otherDescription ? `<p style="margin:8px 0 0;font-size:12px;color:#92400e;font-style:italic;background:#fde68a;padding:8px 12px;border-radius:6px;">Patient note: "${opts.additionalDocs.otherDescription}"</p>` : ""}<p style="margin:8px 0 0;font-size:12px;color:#92400e;">Please prepare all requested documents alongside the ${letterTypeLabel} for this patient.</p></td></tr></table></td></tr>` : "";

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px;"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;"><tr><td style="background:${HEADER_BG};padding:28px 32px;"><img src="${LOGO_URL}" alt="PawTenant" width="160" style="display:block;margin:0 auto 12px;height:auto;" /><p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;text-align:center;">New Case Assigned</p><p style="margin:6px 0 0;font-size:13px;color:${HEADER_SUB};text-align:center;">PawTenant — ${portalLabel}</p></td></tr><tr><td style="padding:28px 32px;"><p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi <strong>${opts.providerName.split(" ")[0]}</strong>,</p><p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">A new ${letterTypeLabel} evaluation case has just been assigned to you. Click below to open it directly in your portal.</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:10px;margin-bottom:24px;"><tr><td style="padding:20px 24px;"><p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Case Details</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:5px 0;font-size:13px;color:#6b7280;width:130px;">Order ID</td><td style="padding:5px 0;font-size:13px;font-weight:700;color:#111827;">${opts.confirmationId}</td></tr><tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Letter Type</td><td style="padding:5px 0;font-size:13px;font-weight:700;color:${ACCENT};">${letterTypeLabel}</td></tr><tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Patient Name</td><td style="padding:5px 0;font-size:13px;font-weight:700;color:#111827;">${opts.patientFirstName} ${opts.patientLastName}</td></tr><tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Patient Email</td><td style="padding:5px 0;font-size:13px;color:#111827;">${opts.patientEmail}</td></tr><tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Patient Phone</td><td style="padding:5px 0;font-size:13px;color:#111827;">${opts.patientPhone || "—"}</td></tr><tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">State</td><td style="padding:5px 0;font-size:13px;font-weight:700;color:#111827;">${opts.patientState}</td></tr><tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Documents Needed</td><td style="padding:5px 0;font-size:13px;font-weight:700;color:${ACCENT};">${letterTypeLabel}${hasExtraDocs ? ` + ${extraDocs.join(", ")}` : ""}</td></tr><tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Status</td><td style="padding:5px 0;font-size:13px;font-weight:700;color:${ACCENT};">Pending Your Review</td></tr></table></td></tr></table><table cellpadding="0" cellspacing="0" style="margin-bottom:16px;"><tr><td style="background:${ACCENT};border-radius:8px;"><a href="${opts.portalUrl}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">View Assigned Order &rarr;</a></td></tr></table><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">Please complete your review and upload all required documents within the agreed timeframe.</p></td></tr>${additionalDocsHtml}<tr><td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:16px 32px;"><p style="margin:0;font-size:12px;color:#9ca3af;">PawTenant &mdash; Provider Notification &mdash; Do not reply to this email.</p></td></tr></table></td></tr></table></body></html>`.trim();

  return sendViaResend({
    to: opts.providerEmail,
    subject: `New ${letterTypeLabel} Case Assigned — ${opts.confirmationId}${hasExtraDocs ? " (Additional Docs Requested)" : ""}`,
    html,
    fromName: "PawTenant",
  });
}

async function sendCustomerAssignedEmail(opts: {
  customerEmail: string; customerFirstName: string; confirmationId: string;
  providerName: string; deliverySpeed: string | null; portalUrl: string; isPSD?: boolean;
}): Promise<boolean> {
  const is24h = opts.deliverySpeed === "24hours" || opts.deliverySpeed === "24h";
  const turnaroundLabel = is24h ? "within 24 hours" : "within 2–3 business days";
  const firstName = opts.customerFirstName || "there";
  const letterTypeLabel = opts.isPSD ? "PSD" : "ESA";

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px;"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;"><tr><td style="background:${HEADER_BG};padding:28px 32px;text-align:center;"><img src="${LOGO_URL}" alt="PawTenant" width="180" style="margin-bottom:14px;display:block;margin-left:auto;margin-right:auto;" /><div style="display:inline-block;background:rgba(255,255,255,0.22);color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:5px 14px;border-radius:999px;">Case Update</div><h1 style="margin:14px 0 4px;font-size:22px;font-weight:700;color:#ffffff;">Your provider has been assigned</h1><p style="margin:0;font-size:13px;color:${HEADER_SUB};">Your ${letterTypeLabel} evaluation is now actively in progress</p></td></tr><tr><td style="padding:32px 32px 24px;"><p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>${firstName}</strong>,</p><p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">Great news — a licensed professional has been assigned to your ${letterTypeLabel} case and is actively reviewing your information.</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:12px;margin-bottom:24px;"><tr><td style="padding:20px 24px;"><p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Your Case Status</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:6px 0;font-size:13px;color:#6b7280;width:140px;">Order ID</td><td style="padding:6px 0;font-size:13px;font-weight:700;color:#111827;font-family:monospace;">${opts.confirmationId}</td></tr><tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Assigned Provider</td><td style="padding:6px 0;font-size:13px;font-weight:700;color:${ACCENT};">${opts.providerName}</td></tr><tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Expected Delivery</td><td style="padding:6px 0;font-size:13px;font-weight:700;color:#111827;">${turnaroundLabel}</td></tr></table></td></tr></table><table cellpadding="0" cellspacing="0" style="margin:0 auto 8px;"><tr><td style="background:${ORANGE};border-radius:10px;"><a href="${opts.portalUrl}" style="display:inline-block;padding:14px 30px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Track My Order &rarr;</a></td></tr></table></td></tr><tr><td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:18px 32px;text-align:center;"><p style="margin:0;font-size:12px;color:#9ca3af;">Questions? <a href="mailto:hello@pawtenant.com" style="color:${ACCENT};">hello@pawtenant.com</a></p></td></tr></table></td></tr></table></body></html>`.trim();

  return sendViaResend({
    to: opts.customerEmail,
    subject: `Your ${letterTypeLabel} provider has been assigned — Order ${opts.confirmationId}`,
    html,
    fromName: "PawTenant",
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const configuredSecret = Deno.env.get("ASSIGN_DOCTOR_SECRET");

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  if (configuredSecret) {
    const headerSecret = req.headers.get("x-assign-secret") ?? "";
    const bodySecret = (body.secretKey as string) ?? "";
    if (headerSecret !== configuredSecret && bodySecret !== configuredSecret) return json({ error: "Unauthorized" }, 401);
  }

  const confirmationId = body.confirmationId as string | undefined;
  const doctorEmail = body.doctorEmail as string | undefined;

  if (!confirmationId || !doctorEmail) return json({ error: "confirmationId and doctorEmail are required" }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const normalizedEmail = doctorEmail.toLowerCase().trim();

  // ── PSD completion gate ────────────────────────────────────────────────────
  // PSD-ASSESSMENT-ANSWERS-PERSISTENCE-AND-RECOVERY-001.
  //
  // A provider must never be handed a psychiatric assessment with no clinical
  // answers in it. They would open the case, find nothing to review, and either
  // bounce it back or — worse — sign off on an intake that was never completed.
  //
  // Checked against the authoritative per-answer rows, not the projected JSON
  // blob and not the caller's claim. The order stays in the customer-completion
  // workflow and Admin is told which answers are missing.
  {
    const { data: gateOrder } = await supabase
      .from("orders").select("id, letter_type").eq("confirmation_id", confirmationId).maybeSingle();
    const gateOrderId = (gateOrder as { id?: string } | null)?.id ?? null;
    const gate = await checkPsdAssessmentComplete(supabase, gateOrderId);
    if (!gate.allowed) {
      console.warn(
        `[assign-doctor] BLOCKED assignment of ${confirmationId}: ${gate.answered}/${gate.requiredTotal} required PSD answers`,
      );
      return json({
        error: gate.adminMessage,
        code: "psd_assessment_incomplete",
        answered: gate.answered,
        requiredTotal: gate.requiredTotal,
        missingCount: gate.missingCount,
        // Question IDs only — never answer values.
        missing: gate.missing,
      }, 409);
    }
  }



  // ── PROVIDER-LETTER-ADMIN-APPROVAL-GATE-AND-AUDIT-UX-001 §16 ───────────────
  // Resolve the ACTING EMPLOYEE from the caller's own JWT. Assignment was
  // previously invoked with the anon key, so this function had no idea who had
  // acted and wrote no audit row at all — "who assigned this order?" was
  // unanswerable. The actor is never taken from the request body: an
  // unauthenticated or automated caller is honestly recorded as System, not
  // attributed to a person.
  const actor = await (async () => {
    const header = req.headers.get("Authorization") ?? "";
    const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKeyEnv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!bearer || bearer === anonKey || bearer === serviceKeyEnv) {
      return { id: null as string | null, name: "PawTenant System", role: "system", type: "system" };
    }
    try {
      const { data: { user } } = await supabase.auth.getUser(bearer);
      if (!user) return { id: null, name: "PawTenant System", role: "system", type: "system" };
      const { data: prof } = await supabase
        .from("doctor_profiles")
        .select("full_name, role, is_admin")
        .eq("user_id", user.id)
        .maybeSingle();
      const p = prof as { full_name?: string; role?: string; is_admin?: boolean } | null;
      return {
        id: user.id,
        name: p?.full_name?.trim() || user.email || "Employee",
        role: p?.role ?? (p?.is_admin ? "admin" : "staff"),
        type: p?.is_admin ? "employee" : "provider",
      };
    } catch {
      return { id: null, name: "PawTenant System", role: "system", type: "system" };
    }
  })();

  let doctorUserId: string | null = null;
  let doctorName = "";
  let doctorTitle = "";
  let doctorIsActive = true;
  let doctorAvailabilityStatus = "active";
  let doctorRate: number | null = null;
  // Readiness gate: portal providers (doctor_profiles) must have accessed the
  // provider portal at least once before they can receive assignments. Legacy
  // doctor_contacts providers have no portal account and are exempt (stays
  // null → gate skipped).
  let isPortalProvider = false;
  let doctorPortalAccessed = true;

  const { data: profileDoctor } = await supabase.from("doctor_profiles").select("user_id, full_name, title, email, phone, is_active, availability_status, per_order_rate, portal_first_accessed_at").eq("email", normalizedEmail).maybeSingle();

  if (profileDoctor) {
    doctorUserId = profileDoctor.user_id;
    doctorName = profileDoctor.full_name ?? "";
    doctorTitle = profileDoctor.title ?? "";
    doctorIsActive = profileDoctor.is_active !== false;
    doctorAvailabilityStatus = profileDoctor.availability_status ?? "active";
    doctorRate = profileDoctor.per_order_rate ?? null;
    isPortalProvider = true;
    doctorPortalAccessed = profileDoctor.portal_first_accessed_at != null;
  } else {
    const { data: contactDoctor } = await supabase.from("doctor_contacts").select("id, full_name, email, phone, is_active, availability_status, per_order_rate").eq("email", normalizedEmail).maybeSingle();
    if (!contactDoctor) {
      const { data: ciDoctor } = await supabase.from("doctor_contacts").select("id, full_name, email, phone, is_active, availability_status, per_order_rate").ilike("email", normalizedEmail).maybeSingle();
      if (!ciDoctor) return json({ error: `Doctor not found for email: ${doctorEmail}.` }, 404);
      doctorName = ciDoctor.full_name ?? "";
      doctorIsActive = ciDoctor.is_active !== false;
      doctorAvailabilityStatus = ciDoctor.availability_status ?? "active";
      doctorRate = ciDoctor.per_order_rate ?? null;
    } else {
      doctorName = contactDoctor.full_name ?? "";
      doctorIsActive = contactDoctor.is_active !== false;
      doctorAvailabilityStatus = contactDoctor.availability_status ?? "active";
      doctorRate = contactDoctor.per_order_rate ?? null;
    }
  }

  if (!doctorIsActive) return json({ error: `Provider ${doctorName} (${normalizedEmail}) is deactivated and cannot receive new assignments.` }, 400);
  if (doctorAvailabilityStatus === "at_capacity") return json({ error: `Provider ${doctorName} (${normalizedEmail}) is currently at capacity and not accepting new assignments.`, availability_status: "at_capacity" }, 400);
  if (isPortalProvider && !doctorPortalAccessed) return json({ error: `Provider ${doctorName} must complete account setup and access the portal before receiving orders.`, reason: "pending_account_setup" }, 400);

  const { data: order, error: orderErr } = await supabase.from("orders").select("id, confirmation_id, email, first_name, last_name, phone, state, doctor_user_id, doctor_name, doctor_email, additional_documents_requested, delivery_speed, price, payment_intent_id, paid_at, status, letter_type, addon_services").eq("confirmation_id", confirmationId).maybeSingle();
  if (orderErr || !order) return json({ error: `Order not found: ${confirmationId}` }, 404);

  // ORDER-PAYMENT-GATING: skipPaymentCheck is intentionally NO LONGER honored — an
  // unpaid base order is never assignable via ANY path. Key ONLY on canonical
  // payment fields (payment_intent_id / paid_at), NOT status (a synthetic /
  // mis-advanced order can be non-'lead' while never actually paid).
  const orderIsPaid = !!order.payment_intent_id || !!order.paid_at;
  if (!orderIsPaid) return json({ ok: false, error: `Order ${confirmationId} cannot be assigned: the consultation booking has not been paid.`, action: "rejected_unpaid_order", orderStatus: order.status ?? "unknown" }, 400);

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = { doctor_status: "pending_review", doctor_name: doctorName, doctor_email: normalizedEmail, last_contacted_at: now };
  if (doctorUserId) updatePayload.doctor_user_id = doctorUserId;

  const previousDoctorName = (order as Record<string, unknown>).doctor_name as string | null ?? null;
  const previousDoctorEmail = (order as Record<string, unknown>).doctor_email as string | null ?? null;

  const { error: updateErr } = await supabase.from("orders").update(updatePayload).eq("confirmation_id", confirmationId);
  if (updateErr) return json({ error: `Failed to assign doctor: ${updateErr.message}` }, 500);

  // Assignment audit. Reassignment is distinguished from a first assignment by
  // whether a DIFFERENT provider was already on the order — the previous
  // provider is recorded so the timeline can read "X moved this from A to B".
  const isReassignment = !!previousDoctorEmail && previousDoctorEmail.toLowerCase() !== normalizedEmail;
  await supabase.from("audit_logs").insert({
    actor_id: actor.id,
    actor_name: actor.name,
    actor_role: actor.role,
    actor_type: actor.type,
    category: "assignment",
    source: actor.id ? "admin_portal" : "api",
    object_type: "order",
    object_id: confirmationId,
    order_id: order.id,
    entity_type: "provider",
    entity_id: doctorUserId ?? normalizedEmail,
    provider_id: doctorUserId,
    action: isReassignment ? "provider_reassigned" : "provider_assigned",
    description: isReassignment
      ? `${actor.name} reassigned order ${confirmationId} from ${previousDoctorName ?? previousDoctorEmail} to ${doctorName}.`
      : `${actor.name} assigned order ${confirmationId} to ${doctorName}.`,
    old_values: { doctor_name: previousDoctorName, doctor_email: previousDoctorEmail },
    new_values: { doctor_name: doctorName, doctor_email: normalizedEmail, doctor_status: "pending_review" },
    metadata: {
      order_id: order.id,
      confirmation_id: confirmationId,
      provider_user_id: doctorUserId,
      provider_email: normalizedEmail,
      previous_provider_email: previousDoctorEmail,
      assigned_at: now,
    },
  });

  let earningsAction = "none";
  const patientName = `${order.first_name ?? ""} ${order.last_name ?? ""}`.trim() || (order.email as string);
  const orderAmount = (order.price as number) ?? null;

  // Guard against duplicate BASE earnings: filter to the base earning only (an add-on row
  // shares the same confirmation_id and would break a bare .maybeSingle() with a
  // multiple-rows error, silently returning null and re-inserting a duplicate base row).
  const { data: existingEarning } = await supabase.from("doctor_earnings").select("id, status, doctor_amount").eq("confirmation_id", confirmationId).eq("earning_type", "base").neq("status", "cancelled").order("created_at", { ascending: true }).limit(1).maybeSingle();

  if (existingEarning) {
    if (existingEarning.status === "pending") {
      await supabase.from("doctor_earnings").update({ doctor_user_id: doctorUserId ?? existingEarning.id, doctor_name: doctorName, doctor_email: normalizedEmail, doctor_amount: doctorRate, order_amount: orderAmount, patient_name: patientName, patient_state: order.state ?? null }).eq("id", existingEarning.id as string);
      earningsAction = "updated";
    } else { earningsAction = "skipped_already_paid"; }
  } else {
    const { error: earnErr } = await supabase.from("doctor_earnings").insert({ doctor_user_id: doctorUserId ?? null, doctor_name: doctorName, doctor_email: normalizedEmail, order_id: order.id as string, confirmation_id: confirmationId, patient_name: patientName, patient_state: order.state ?? null, order_amount: orderAmount, doctor_amount: doctorRate, status: "pending", earning_type: "base", notes: doctorRate == null ? "Rate not set — please set payout amount in the Providers tab" : null });
    // 23505 = unique_violation on the base-earning partial index → a concurrent path already created it; treat as benign.
    earningsAction = !earnErr ? "created" : ((earnErr as { code?: string }).code === "23505" ? "skipped_duplicate" : "insert_error");
  }

  if (doctorUserId) {
    await supabase.from("doctor_notifications").insert({ doctor_user_id: doctorUserId, title: "New Case Assigned", message: `A new case has been assigned to you: ${patientName} from ${order.state ?? "Unknown State"} (Order: ${confirmationId}). Please review in your dashboard.`, type: "case_assigned", confirmation_id: confirmationId, order_id: order.id as string });
  }

  const siteUrl = Deno.env.get("SITE_URL") ?? "https://pawtenant.com";
  const additionalDocs = order.additional_documents_requested as AdditionalDocRequest | null;
  const isPSD = (order.letter_type as string) === "psd" || (confirmationId ?? "").toUpperCase().includes("-PSD");
  const portalUrl = `${siteUrl}/provider-portal?order=${confirmationId}`;
  const addonServices = Array.isArray(order.addon_services) ? (order.addon_services as string[]) : [];

  const emailSent = await sendProviderEmail({
    providerEmail: normalizedEmail, providerName: doctorName, patientFirstName: order.first_name ?? "Patient",
    patientLastName: order.last_name ?? "", patientEmail: order.email ?? "", patientPhone: order.phone ?? "",
    patientState: order.state ?? "Unknown", confirmationId, portalUrl, additionalDocs, isPSD,
  });

  const customerEmailSent = await sendCustomerAssignedEmail({
    customerEmail: order.email as string, customerFirstName: order.first_name ?? "", confirmationId,
    providerName: doctorName, deliverySpeed: order.delivery_speed ?? null, portalUrl: `${siteUrl}/my-orders`, isPSD,
  });

  await appendEmailLog(supabase, confirmationId, [
    { type: "provider_assigned_customer", sentAt: now, to: order.email as string, success: customerEmailSent },
    { type: "provider_assigned_provider", sentAt: now, to: normalizedEmail, success: emailSent },
  ]);

  // Primary log → communications (both customer + provider notifications)
  await logEmailComm({
    supabase,
    orderId: order.id as string,
    confirmationId,
    to: order.email as string,
    from: "PawTenant <hello@pawtenant.com>",
    subject: `Your ${isPSD ? "PSD" : "ESA"} Provider Has Been Assigned — Order ${confirmationId}`,
    body: null,
    slug: "provider_assigned_customer",
    sentBy: "system_assign_doctor",
    success: customerEmailSent,
  });
  await logEmailComm({
    supabase,
    orderId: order.id as string,
    confirmationId,
    to: normalizedEmail,
    from: "PawTenant <hello@pawtenant.com>",
    subject: `New Case Assigned — ${patientName} (${order.state ?? "Unknown"})`,
    body: null,
    slug: "provider_assigned_provider",
    sentBy: "system_assign_doctor",
    success: emailSent,
  });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  // ── Fire GHL doctor_assigned event with exact 8-field payload ────────────
  fetch(`${supabaseUrl}/functions/v1/ghl-webhook-proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({
      webhookType: "main",
      eventType: "doctor_assigned",
      firstName: order.first_name ?? "",
      lastName: order.last_name ?? "",
      email: order.email,
      phone: order.phone ?? "",
      state: order.state ?? "",
      confirmationId,
      amount: (order.price as number) ?? 0,
      // Additional context fields
      letterType: isPSD ? "psd" : "esa",
      addonServices,
      assignedDoctor: doctorName,
      doctorTitle,
      additionalDocsRequested: additionalDocs?.types ?? [],
      leadStatus: isPSD ? "PSD — Doctor Assigned — Pending Review" : "ESA — Doctor Assigned — Pending Review",
      tags: ["Doctor Assigned", "Pending Review"],
    }),
  }).catch(() => {});

  // ── Pending additional-documentation handoff (ADDITIONAL-DOCUMENTATION-
  // PROVIDER-NOTIFICATION-001) ──────────────────────────────────────────────
  // If the customer already uploaded the requested additional documentation
  // while the order was UNASSIGNED, that notification has been sitting pending —
  // there was nobody to send it to. Now that a provider is assigned, fire it.
  // This is also the REASSIGNMENT path: the notifier's dedupe key includes the
  // provider address, so the newly assigned provider is notified exactly once
  // and the previous provider is not re-notified. A no-op when there is no
  // actionable additional-documentation request.
  await notifyProviderAdditionalDoc({
    supabaseUrl,
    serviceKey,
    confirmationId,
    trigger: "assignment",
  });

  return json({
    ok: true,
    message: `Order ${confirmationId} assigned to ${doctorName} (${normalizedEmail})`,
    doctorName, doctorUserId: doctorUserId ?? "no-portal-account",
    hasPortalLogin: !!doctorUserId, notificationSent: !!doctorUserId,
    emailSent, customerEmailSent, additionalDocsIncluded: !!(additionalDocs?.types?.length),
    earningsRecord: { action: earningsAction, rateApplied: doctorRate, rateSet: doctorRate != null },
    portalUrl,
  });
});
