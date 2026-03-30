import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-assign-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

interface AdditionalDocRequest {
  types?: string[];
  otherDescription?: string;
}

type EmailLogEntry = { type: string; sentAt: string; to: string; success: boolean };

async function appendEmailLog(
  supabase: ReturnType<typeof createClient>,
  confirmationId: string,
  entries: EmailLogEntry[],
): Promise<void> {
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

  const additionalDocsHtml = hasExtraDocs ? `<tr><td style="padding:14px 24px;border-top:1px solid #e5e7eb;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:14px 18px;"><tr><td><p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.08em;">⚠️ Additional Documents Requested</p><p style="margin:0 0 8px;font-size:13px;color:#78350f;">This patient has requested the following additional documentation:</p><ul style="margin:0 0 8px;padding-left:16px;">${extraDocs.map((doc) => `<li style="font-size:13px;color:#78350f;font-weight:600;margin-bottom:4px;">${doc}</li>`).join("")}</ul>${opts.additionalDocs?.otherDescription ? `<p style="margin:8px 0 0;font-size:12px;color:#92400e;font-style:italic;background:#fde68a;padding:8px 12px;border-radius:6px;">Patient note: "${opts.additionalDocs.otherDescription}"</p>` : ""}<p style="margin:8px 0 0;font-size:12px;color:#92400e;">Please prepare all requested documents alongside the ${letterTypeLabel} for this patient.</p></td></tr></table></td></tr>` : "";

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;"><tr><td style="background:#1a5c4f;padding:28px 32px;"><p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">New Case Assigned</p><p style="margin:6px 0 0;font-size:13px;color:#a7d5ca;">PawTenant — ${portalLabel}</p></td></tr><tr><td style="padding:28px 32px;"><p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi <strong>${opts.providerName.split(" ")[0]}</strong>,</p><p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">A new ${letterTypeLabel} evaluation case has just been assigned to you. Click below to open it directly in your portal.</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:10px;margin-bottom:24px;"><tr><td style="padding:20px 24px;"><p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Case Details</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:5px 0;font-size:13px;color:#6b7280;width:130px;">Order ID</td><td style="padding:5px 0;font-size:13px;font-weight:700;color:#111827;">${opts.confirmationId}</td></tr><tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Letter Type</td><td style="padding:5px 0;font-size:13px;font-weight:700;color:#1a5c4f;">${letterTypeLabel}</td></tr><tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Patient Name</td><td style="padding:5px 0;font-size:13px;font-weight:700;color:#111827;">${opts.patientFirstName} ${opts.patientLastName}</td></tr><tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Patient Email</td><td style="padding:5px 0;font-size:13px;color:#111827;">${opts.patientEmail}</td></tr><tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Patient Phone</td><td style="padding:5px 0;font-size:13px;color:#111827;">${opts.patientPhone || "—"}</td></tr><tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">State</td><td style="padding:5px 0;font-size:13px;font-weight:700;color:#111827;">${opts.patientState}</td></tr><tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Documents Needed</td><td style="padding:5px 0;font-size:13px;font-weight:700;color:#1a5c4f;">${letterTypeLabel}${hasExtraDocs ? ` + ${extraDocs.join(", ")}` : ""}</td></tr><tr><td style="padding:5px 0;font-size:13px;color:#6b7280;">Status</td><td style="padding:5px 0;font-size:13px;font-weight:700;color:#1a5c4f;">Pending Your Review</td></tr></table></td></tr></table><table cellpadding="0" cellspacing="0" style="margin-bottom:16px;"><tr><td style="background:#1a5c4f;border-radius:8px;"><a href="${opts.portalUrl}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">View Assigned Order &rarr;</a></td></tr></table><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">Please complete your review and upload all required documents within the agreed timeframe.</p></td></tr>${additionalDocsHtml}<tr><td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:16px 32px;"><p style="margin:0;font-size:12px;color:#9ca3af;">PawTenant &mdash; Provider Notification &mdash; Do not reply to this email.</p></td></tr></table></td></tr></table></body></html>`.trim();

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

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;"><tr><td style="background:#1a5c4f;padding:28px 32px;text-align:center;"><img src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png" alt="PawTenant" width="180" style="margin-bottom:14px;display:block;margin-left:auto;margin-right:auto;" /><div style="display:inline-block;background:#2d7d6b;color:#a7d5ca;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:5px 14px;border-radius:999px;">Case Update</div><h1 style="margin:14px 0 4px;font-size:22px;font-weight:700;color:#ffffff;">Your provider has been assigned</h1><p style="margin:0;font-size:13px;color:#a7d5ca;">Your ${letterTypeLabel} evaluation is now actively in progress</p></td></tr><tr><td style="padding:32px 32px 24px;"><p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>${firstName}</strong>,</p><p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">Great news — a licensed professional has been assigned to your ${letterTypeLabel} case and is actively reviewing your information.</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:12px;margin-bottom:24px;"><tr><td style="padding:20px 24px;"><p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Your Case Status</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:6px 0;font-size:13px;color:#6b7280;width:140px;">Order ID</td><td style="padding:6px 0;font-size:13px;font-weight:700;color:#111827;font-family:monospace;">${opts.confirmationId}</td></tr><tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Assigned Provider</td><td style="padding:6px 0;font-size:13px;font-weight:700;color:#1a5c4f;">${opts.providerName}</td></tr><tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Expected Delivery</td><td style="padding:6px 0;font-size:13px;font-weight:700;color:#111827;">${turnaroundLabel}</td></tr></table></td></tr></table><table cellpadding="0" cellspacing="0" style="margin:0 auto 8px;"><tr><td style="background:#ff6a00;border-radius:10px;"><a href="${opts.portalUrl}" style="display:inline-block;padding:14px 30px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Track My Order &rarr;</a></td></tr></table></td></tr><tr><td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:18px 32px;text-align:center;"><p style="margin:0;font-size:12px;color:#9ca3af;">Questions? <a href="mailto:hello@pawtenant.com" style="color:#1a5c4f;">hello@pawtenant.com</a></p></td></tr></table></td></tr></table></body></html>`.trim();

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
    if (headerSecret !== configuredSecret && bodySecret !== configuredSecret) {
      return json({ error: "Unauthorized" }, 401);
    }
  }

  const confirmationId = body.confirmationId as string | undefined;
  const doctorEmail = body.doctorEmail as string | undefined;
  const skipPaymentCheck = body.skipPaymentCheck === true;

  if (!confirmationId || !doctorEmail) return json({ error: "confirmationId and doctorEmail are required" }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const normalizedEmail = doctorEmail.toLowerCase().trim();

  let doctorUserId: string | null = null;
  let doctorName = "";
  let doctorTitle = "";
  let doctorIsActive = true;
  let doctorAvailabilityStatus = "active";
  let doctorRate: number | null = null;

  const { data: profileDoctor } = await supabase
    .from("doctor_profiles").select("user_id, full_name, title, email, phone, is_active, availability_status, per_order_rate")
    .eq("email", normalizedEmail).maybeSingle();

  if (profileDoctor) {
    doctorUserId = profileDoctor.user_id;
    doctorName = profileDoctor.full_name ?? "";
    doctorTitle = profileDoctor.title ?? "";
    doctorIsActive = profileDoctor.is_active !== false;
    doctorAvailabilityStatus = profileDoctor.availability_status ?? "active";
    doctorRate = profileDoctor.per_order_rate ?? null;
  } else {
    const { data: contactDoctor } = await supabase
      .from("doctor_contacts").select("id, full_name, email, phone, is_active, availability_status, per_order_rate")
      .eq("email", normalizedEmail).maybeSingle();
    if (!contactDoctor) {
      const { data: ciDoctor } = await supabase
        .from("doctor_contacts").select("id, full_name, email, phone, is_active, availability_status, per_order_rate")
        .ilike("email", normalizedEmail).maybeSingle();
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

  // Hard block: deactivated providers cannot receive assignments
  if (!doctorIsActive) return json({ error: `Provider ${doctorName} (${normalizedEmail}) is deactivated and cannot receive new assignments.` }, 400);

  // Soft block: at-capacity providers cannot receive new assignments
  if (doctorAvailabilityStatus === "at_capacity") {
    return json({
      error: `Provider ${doctorName} (${normalizedEmail}) is currently at capacity and not accepting new assignments. Change their availability status in the Providers tab first.`,
      availability_status: "at_capacity",
    }, 400);
  }

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, confirmation_id, email, first_name, last_name, phone, state, doctor_user_id, additional_documents_requested, delivery_speed, price, payment_intent_id, status, letter_type, addon_services")
    .eq("confirmation_id", confirmationId).maybeSingle();

  if (orderErr || !order) return json({ error: `Order not found: ${confirmationId}` }, 404);

  if (!skipPaymentCheck) {
    const orderIsPaid = !!(order.payment_intent_id) || (order.status !== "lead" && !!order.status);
    if (!orderIsPaid) return json({ ok: false, warning: `Order ${confirmationId} has not been paid yet.`, action: "skipped_unpaid_order", orderStatus: order.status ?? "unknown" }, 400);
  }

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    doctor_status: "pending_review", doctor_name: doctorName, doctor_email: normalizedEmail, last_contacted_at: now,
  };
  if (doctorUserId) updatePayload.doctor_user_id = doctorUserId;

  const { error: updateErr } = await supabase.from("orders").update(updatePayload).eq("confirmation_id", confirmationId);
  if (updateErr) return json({ error: `Failed to assign doctor: ${updateErr.message}` }, 500);

  let earningsAction = "none";
  const patientName = `${order.first_name ?? ""} ${order.last_name ?? ""}`.trim() || (order.email as string);
  const orderAmount = (order.price as number) ?? null;

  const { data: existingEarning } = await supabase.from("doctor_earnings").select("id, status, doctor_amount").eq("confirmation_id", confirmationId).maybeSingle();

  if (existingEarning) {
    if (existingEarning.status === "pending") {
      await supabase.from("doctor_earnings").update({ doctor_user_id: doctorUserId ?? existingEarning.id, doctor_name: doctorName, doctor_email: normalizedEmail, doctor_amount: doctorRate, order_amount: orderAmount, patient_name: patientName, patient_state: order.state ?? null }).eq("id", existingEarning.id as string);
      earningsAction = "updated";
    } else { earningsAction = "skipped_already_paid"; }
  } else {
    await supabase.from("doctor_earnings").insert({ doctor_user_id: doctorUserId ?? null, doctor_name: doctorName, doctor_email: normalizedEmail, order_id: order.id as string, confirmation_id: confirmationId, patient_name: patientName, patient_state: order.state ?? null, order_amount: orderAmount, doctor_amount: doctorRate, status: "pending", notes: doctorRate == null ? "Rate not set — please set payout amount in the Providers tab" : null });
    earningsAction = "created";
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  fetch(`${supabaseUrl}/functions/v1/ghl-webhook-proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({
      webhookType: "main",
      event: "doctor_assigned",
      email: order.email,
      firstName: order.first_name ?? "",
      lastName: order.last_name ?? "",
      phone: order.phone ?? "",
      confirmationId,
      patientState: order.state ?? "",
      letterType: isPSD ? "psd" : "esa",
      addonServices,
      price: order.price,
      assignedDoctor: doctorName,
      doctorTitle,
      additionalDocsRequested: additionalDocs?.types ?? [],
      leadStatus: isPSD ? "PSD — Doctor Assigned — Pending Review" : "ESA — Doctor Assigned — Pending Review",
      tags: ["Doctor Assigned", "Pending Review"],
    }),
  }).catch(() => {});

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
