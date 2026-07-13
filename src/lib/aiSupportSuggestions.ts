// aiSupportSuggestions.ts — PawTenant AI Support Assistant (Phase 1, rules scaffold)
//
// PURE logic. No React, no network, no secrets, no DB. Deterministic.
// Generates ADMIN-ONLY, DRAFT-ONLY suggestions. Nothing here sends anything.
//
// Phase 2 will swap the bodies of buildSmsSuggestion / buildCallSummary for an LLM call
// behind the same return shapes — the UI never has to change.

// ── Public types ────────────────────────────────────────────────────────────

export type SmsIntent =
  | "sms_opt_out"
  | "refund_cancel"
  | "landlord_verify"
  | "timeline_status"
  | "clinical_approval"
  | "emergency_legal"
  | "general";

export type Urgency = "low" | "medium" | "high";

export interface SmsContext {
  firstName: string;
  state?: string | null;
  letterType?: string | null;
  price?: number | null;
}

export interface SmsSuggestion {
  intent: SmsIntent;
  intentLabel: string;
  urgency: Urgency;
  /** The suggested reply text the admin can drop into the composer. */
  draft: string;
  /** Plain-English why-this-intent + which support rule applied. */
  rationale: string;
  /** True when a human MUST review before anything goes out (e.g. legal/eviction). */
  escalate: boolean;
  /**
   * False when the draft must NOT be sent as an SMS (e.g. opt-out/STOP). When false,
   * `draft` is an admin note only and the UI must not offer "Use as draft".
   */
  sendable: boolean;
  /** Compliance warning shown prominently in the UI (set for opt-out). */
  warning?: string;
}

/** A minimal shape for a call row pulled from `communications`. */
export interface CallRowLite {
  direction?: string | null;   // "inbound" | "outbound"
  status?: string | null;      // missed | answered | no_answer | completed | voicemail | ...
  durationSeconds?: number | null;
  note?: string | null;        // body / logged note text, if any
  at?: string | null;          // ISO timestamp
}

export interface CallSummary {
  /** Honest, metadata-based recap. */
  summary: string;
  intent: string;
  urgency: Urgency;
  recommendedAction: string;
  /** A short follow-up SMS draft the admin can use. */
  followUpSms: string;
  /** True when the call set needs prompt human attention (missed inbound, etc.). */
  escalate: boolean;
}

// ── Support-rule copy (single place to tweak tone) ──────────────────────────

const SIGNOFF = "— PawTenant Support";

const INTENT_LABEL: Record<SmsIntent, string> = {
  sms_opt_out: "SMS Opt-Out",
  refund_cancel: "Refund / Cancellation",
  landlord_verify: "Landlord Verification",
  timeline_status: "Timeline / Status",
  clinical_approval: "Clinical Approval Question",
  emergency_legal: "Emergency / Legal",
  general: "General Question",
};

// ── Intent detection ────────────────────────────────────────────────────────

const KEYWORDS: Array<{ intent: SmsIntent; re: RegExp }> = [
  // Order matters: emergency/legal is checked first so an "evicting me, refund me"
  // message escalates rather than being treated as a plain refund.
  {
    intent: "emergency_legal",
    re: /\b(evict|eviction|court|lawyer|attorney|legal|lawsuit|sue|suing|threat|deadline|emergency|urgent|asap|homeless|kick(ed)? out|move out by)\b/i,
  },
  {
    intent: "refund_cancel",
    re: /\b(refund|cancel|cancellation|money back|charge ?back|dispute|reimburse|reverse the charge|want my money)\b/i,
  },
  {
    intent: "landlord_verify",
    re: /\b(landlord|property manager|leasing|verify|verification|verif|authentic|legit|legitimate|real|fake|proof|confirm (the )?letter)\b/i,
  },
  {
    intent: "clinical_approval",
    re: /\b(approve|approved|approval|qualify|qualif|eligible|will i get|guarantee|guaranteed|denied|rejected|pass)\b/i,
  },
  {
    intent: "timeline_status",
    re: /\b(how long|when will|when do|timeline|eta|status|ready|waiting|still waiting|received|got it|today|tomorrow|days?|hours?|24 ?hour|update)\b/i,
  },
];

// ── SMS opt-out (STOP) detection ────────────────────────────────────────────
// Carrier opt-out keywords. Matched ONLY when the WHOLE message is essentially
// just the keyword (after stripping punctuation/whitespace), so a real sentence
// like "I want to cancel my order" is NOT treated as an opt-out.
const OPT_OUT_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);

export function isSmsOptOut(text: string | null | undefined): boolean {
  const raw = (text || "").trim().toLowerCase();
  if (!raw) return false;
  // Letters only: "stop." -> "stop", "STOP ALL" -> "stopall", "cancel my order" -> "cancelmyorder".
  const normalized = raw.replace(/[^a-z]/g, "");
  return OPT_OUT_WORDS.has(normalized);
}

export function detectSmsIntent(text: string | null | undefined): SmsIntent {
  const t = (text || "").trim();
  if (!t) return "general";
  // Opt-out is checked FIRST so an exact "cancel"/"stop" never falls through to a
  // normal support reply.
  if (isSmsOptOut(t)) return "sms_opt_out";
  for (const { intent, re } of KEYWORDS) {
    if (re.test(t)) return intent;
  }
  return "general";
}

// ── SMS draft builder ───────────────────────────────────────────────────────

export function buildSmsSuggestion(
  inboundText: string | null | undefined,
  ctx: SmsContext,
): SmsSuggestion {
  const intent = detectSmsIntent(inboundText);
  const name = (ctx.firstName || "there").trim() || "there";

  let draft = "";
  let urgency: Urgency = "low";
  let escalate = false;
  let rationale = "";
  let sendable = true;
  let warning: string | undefined;

  switch (intent) {
    case "sms_opt_out":
      urgency = "high";
      escalate = true;
      sendable = false; // NEVER auto-reply to an opt-out.
      warning =
        "Customer may have opted out of SMS. Do not reply by SMS unless compliance status is verified.";
      // This is an ADMIN NOTE, not a customer reply. The UI must not offer "Use as draft".
      draft = `Admin note (do NOT send as SMS): the customer's message ("${(inboundText || "").trim()}") matches an SMS opt-out keyword. Do not reply by SMS. Verify SMS opt-out status in GHL / the phone system. If follow-up is genuinely needed, use email or an internal note — never manually override an SMS opt-out.`;
      rationale =
        "Message matches a carrier SMS opt-out keyword (STOP / STOPALL / UNSUBSCRIBE / CANCEL / END / QUIT). Support rule: never auto-reply to an opt-out — treat as compliance-sensitive and require admin review.";
      break;

    case "emergency_legal":
      urgency = "high";
      escalate = true;
      draft = `Hi ${name}, thank you for letting us know — this is important to us and I'm flagging it to our team right now so we can help you properly. We'll be in touch very shortly. ${SIGNOFF}`;
      rationale =
        "Message mentions legal/eviction/emergency language. Support rule: do NOT make promises — send a holding reply and escalate to admin/manager immediately for human review.";
      break;

    case "refund_cancel":
      urgency = "medium";
      escalate = true; // refund/cancel decisions are admin policy calls
      draft = `Hi ${name}, thanks for reaching out and I'm sorry for any hassle. I've noted your request — our team will review it against our refund policy and follow up with you shortly. We want to make this right. ${SIGNOFF}`;
      rationale =
        "Refund/cancellation intent. Support rule: stay aligned with the existing refund policy/templates, acknowledge warmly, and route the actual decision to an admin (do not promise an outcome).";
      break;

    case "landlord_verify":
      urgency = "low";
      draft = `Hi ${name}, good news — your landlord can verify your PawTenant letter directly with us. Ask them to contact our support and we'll confirm it's authentic. Let me know if they need anything specific. ${SIGNOFF}`;
      rationale =
        "Landlord/verification intent. Support rule: tell the customer their landlord can verify the letter through PawTenant support.";
      break;

    case "timeline_status":
      urgency = "medium";
      draft = `Hi ${name}, thanks for checking in! Once a licensed provider completes their review, your letter is typically issued within 24 hours and we'll email it as soon as it's ready. ${SIGNOFF}`;
      rationale =
        "Timeline/status intent. Support rule: the 24-hour timeline applies AFTER a licensed provider completes review — phrased here so it isn't promised before review.";
      break;

    case "clinical_approval":
      urgency = "medium";
      draft = `Hi ${name}, great question. Approval is decided by an independent licensed provider after they review your information — we can't guarantee the outcome, but we'll keep you updated at every step. ${SIGNOFF}`;
      rationale =
        "Approval/eligibility intent. Support rule: never overpromise clinical approval — make clear an independent licensed provider decides after review.";
      break;

    default:
      urgency = "low";
      draft = `Hi ${name}, thanks for your message! I'd be glad to help — could you share a little more detail so I can point you in the right direction? ${SIGNOFF}`;
      rationale =
        "No specific intent detected. Sending a warm, short reply that invites detail.";
      break;
  }

  return {
    intent,
    intentLabel: INTENT_LABEL[intent],
    urgency,
    draft,
    rationale,
    escalate,
    sendable,
    warning,
  };
}

// ── Call summary builder ────────────────────────────────────────────────────

function fmtDuration(sec?: number | null): string {
  const s = Math.max(0, Math.round(sec || 0));
  if (s === 0) return "0s";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

const MISSED = new Set(["missed", "no_answer", "no-answer", "busy", "failed"]);

export function buildCallSummary(
  calls: CallRowLite[],
  ctx: SmsContext,
): CallSummary {
  const name = (ctx.firstName || "there").trim() || "there";

  if (!calls || calls.length === 0) {
    return {
      summary: "No call records on this order yet.",
      intent: "Unknown — no calls logged.",
      urgency: "low",
      recommendedAction: "No action needed from call history.",
      followUpSms: "",
      escalate: false,
    };
  }

  const inbound = calls.filter((c) => (c.direction || "").toLowerCase() === "inbound");
  const outbound = calls.filter((c) => (c.direction || "").toLowerCase() === "outbound");
  const missedInbound = inbound.filter((c) => MISSED.has((c.status || "").toLowerCase()));
  const notes = calls.map((c) => (c.note || "").trim()).filter(Boolean);
  const notesText = notes.join(" ");

  // Honest, metadata-based recap — there is no transcript in the data model yet.
  const parts: string[] = [];
  parts.push(
    `${calls.length} call${calls.length === 1 ? "" : "s"} on record (${inbound.length} inbound, ${outbound.length} outbound).`,
  );
  if (missedInbound.length > 0) {
    parts.push(`${missedInbound.length} inbound call${missedInbound.length === 1 ? "" : "s"} went unanswered.`);
  }
  const answered = calls.filter((c) => !MISSED.has((c.status || "").toLowerCase()) && (c.durationSeconds || 0) > 0);
  if (answered.length > 0) {
    const longest = answered.reduce((a, b) => ((b.durationSeconds || 0) > (a.durationSeconds || 0) ? b : a));
    parts.push(`Longest connected call ~${fmtDuration(longest.durationSeconds)}.`);
  }
  if (notes.length > 0) {
    parts.push(`Logged note(s): "${notesText.slice(0, 160)}${notesText.length > 160 ? "…" : ""}".`);
  } else {
    parts.push("No call notes or transcript available — summary is based on call metadata only.");
  }
  const summary = parts.join(" ");

  // Intent: infer from any note text via the SMS detector; otherwise unknown.
  let intent = "Unknown — no transcript; add a call note to capture customer intent.";
  if (notesText) {
    const noteIntent = detectSmsIntent(notesText);
    if (noteIntent !== "general") {
      intent = `Likely "${INTENT_LABEL[noteIntent]}" (inferred from logged call note).`;
    } else {
      intent = "General inquiry (inferred from logged call note).";
    }
  }

  // Urgency + recommended action.
  let urgency: Urgency = "low";
  let recommendedAction = "Review the call log; follow up if the customer is waiting on anything.";
  let escalate = false;

  const noteIntent = notesText ? detectSmsIntent(notesText) : "general";
  if (noteIntent === "emergency_legal") {
    urgency = "high";
    escalate = true;
    recommendedAction = "Escalate to admin/manager immediately — call note suggests a legal/eviction or emergency matter.";
  } else if (missedInbound.length > 0) {
    urgency = "medium";
    escalate = true;
    recommendedAction = `Return the missed inbound call to ${name}, then send a quick follow-up SMS so they know you tried to reach them.`;
  } else if (noteIntent === "refund_cancel") {
    urgency = "medium";
    recommendedAction = "Review against refund policy and follow up — decision is an admin call.";
  }

  // Follow-up SMS draft — reuse the SMS builder so tone/rules stay consistent.
  // If the note itself reads as an opt-out, the builder returns a non-sendable
  // admin note; never surface that as a sendable follow-up SMS.
  const noteSuggestion = buildSmsSuggestion(notesText, ctx);
  const followUpSms = missedInbound.length > 0
    ? `Hi ${name}, sorry we missed your call! This is PawTenant Support — happy to help. Reply here any time or let us know a good time to call you back. ${SIGNOFF}`
    : (noteSuggestion.sendable ? noteSuggestion.draft : "");

  return { summary, intent, urgency, recommendedAction, followUpSms, escalate };
}
