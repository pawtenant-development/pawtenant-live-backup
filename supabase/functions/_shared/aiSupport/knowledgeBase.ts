// knowledgeBase.ts — PawTenant AI Support Knowledge Base v1 (TEST-first).
//
// PURE data + string builders. No Deno APIs, no network — same contract as
// policy.ts so it runs identically in edge functions and the Node test
// harness. This file is the single auditable source of truth for what the
// AI support assistant may STATE (facts, prices, links, the one discount
// code) across chat and SMS. What the AI may DO (auto-send / draft /
// escalate / block) stays in policy.ts and is NOT weakened here.
//
// Change protocol: edit this file + redeploy the two inbound functions.
// Keep every fact compliance-safe: no guaranteed approval, no government/
// registry claims, PSD letters never create service-dog status.

// ── A. Service facts ──────────────────────────────────────────────────────────
export const KB_SERVICE_FACTS: readonly string[] = [
  "PawTenant offers online ESA (Emotional Support Animal) evaluations with provider-reviewed ESA letters for HOUSING.",
  "PawTenant offers PSD (Psychiatric Service Dog) letter/documentation support for handlers with a disability-related need and a task-trained psychiatric service dog. PawTenant PSD documentation can support BOTH housing-related accommodation needs AND travel contexts for eligible situations.",
  "NEVER say a PSD letter is 'not for housing', 'does not include housing', or that the customer needs an ESA letter instead for housing. If a customer with an existing/paid PSD order asks whether housing is covered, reassure them supportively (PSD documentation can support housing-related accommodation needs) and flag the order for the support team — never push a second product.",
  "A PSD letter does NOT create service-dog status — training and a disability-related need do. Never imply a purchase makes a dog a service dog.",
  "Every request is reviewed by a licensed provider. Approval is not automatic.",
  "Turnaround: most APPROVED letters are delivered within 24 hours, and many the same day, depending on provider review and the information the customer submitted. State this as typical, never as a guaranteed time, and never guarantee approval.",
  "A same-day PDF may be available after provider approval — never promise unconditional same-day delivery.",
  "If a customer does not qualify after provider review, they are refunded according to our policy.",
  "Letters are delivered digitally through the customer portal (My Orders).",
];

// ── B. Pricing (mirrors LIVE public pricing, launched 2026-07-04) ─────────────
export const KB_PRICING = {
  esa_one_time_1: "$129",
  esa_one_time_2_3: "$149 total",
  psd_one_time_1: "$129",
  psd_one_time_2_3: "$149 total",
  esa_annual_1: "$109/year",
  esa_annual_2_3: "$129/year total",
  psd_annual_1: "$109/year",
  psd_annual_2_3: "$129/year total",
} as const;

// ── C. Discount rule (the ONLY discount the AI may ever mention) ──────────────
export const KB_DISCOUNT = {
  code: "PAW20",
  amount: "$20 off",
  /** The one approved sentence. */
  phrase: "You can use code PAW20 for $20 off your order.",
  rules: [
    "Offer PAW20 ONLY when the customer shows a price objection (too expensive, can't afford, asks for a discount/coupon/promo, price is high).",
    "PAW20 is the only code that exists. Never invent, imply, or negotiate any other discount or amount.",
    "Never stack discounts or combine PAW20 with anything else.",
    "Offer it at most ONCE per conversation — never repeat the code if it was already given.",
    "Never connect the discount to approval odds — a discount never changes provider review.",
    "If the customer already has an order/payment (billing complaint, charged already, wants money off a PAID order): do NOT offer the code — that is a billing issue for the team.",
  ],
} as const;

// ── D. Canonical links (route-audited 2026-07-07; non-www ONLY) ───────────────
// Every URL below exists in src/router/config.tsx and the public sitemap.
// NEVER share any URL not in this list — no guessed paths, no www, no
// TEST-only funnels (/psd-consultation) and no noindex ad landing pages.
export const KB_LINKS = {
  homepage: "https://pawtenant.com",
  esa_start: "https://pawtenant.com/assessment",
  psd_start: "https://pawtenant.com/psd-assessment",
  verify_howto: "https://pawtenant.com/how-to-verify-esa-letter",
  verify_tool: "https://pawtenant.com/verify",
  pricing_info: "https://pawtenant.com/esa-letter-cost",
  contact: "https://pawtenant.com/contact-us",
} as const;

export const KB_LINK_INTENTS: readonly { intent: string; url: string }[] = [
  { intent: "How to apply / get / start an ESA letter", url: KB_LINKS.esa_start },
  { intent: "How to apply / get / start a PSD letter", url: KB_LINKS.psd_start },
  { intent: "Landlord wants to verify a letter / how verification works", url: KB_LINKS.verify_howto },
  { intent: "Verify a specific letter right now (has a letter ID)", url: KB_LINKS.verify_tool },
  { intent: "Pricing details / cost breakdown page", url: KB_LINKS.pricing_info },
  { intent: "Talk to a human / contact support", url: KB_LINKS.contact },
  { intent: "General website", url: KB_LINKS.homepage },
];

// ── E/F. Category behavior documentation (informational — policy.ts decides) ──
// Safe categories that MAY auto-send when every policy gate passes:
export const KB_SAFE_AUTO_TOPICS: readonly string[] = [
  "landlord_verification", "pricing (incl. PAW20 price objection with no existing order)",
  "letter_timing", "upload_documents",
  "how-to-apply ESA (share the assessment link)",
  "how-to-apply PSD (safe wording only — concise KB psd_apply link snippet; medical/qualify/fraud phrasing is hard-blocked FIRST)",
];
// Always draft/escalate/block — hard policy in policy.ts NEVER_AUTO_SEND + modes:
export const KB_ESCALATION_TOPICS: readonly string[] = [
  "legal/eviction threats", "fraud/fake/backdate/misrepresentation", "medical crisis/self-harm",
  "refunds/payment disputes", "complaints", "chargebacks", "opt-out/STOP",
  "provider clinical judgment", "letter changes requiring a provider",
  "already-paid discount/billing requests", "sensitive PSD qualification specifics",
  "paid/submitted-order product-scope questions (what does my paid order include)",
];

// ── G. Approved response snippets (edit here, not in the model's head) ────────
export const KB_SNIPPETS = {
  esa_apply:
    `You can start your ESA assessment here: ${KB_LINKS.esa_start}. It's a short online evaluation reviewed by a licensed provider.`,
  psd_apply:
    `You can start a PSD assessment here: ${KB_LINKS.psd_start}. PSD documentation may support housing and travel accommodation needs for handlers with a disability-related need and a task-trained psychiatric service dog — a licensed provider reviews every request.`,
  pricing:
    `An ESA letter is ${KB_PRICING.esa_one_time_1} one-time (2-3 pets: ${KB_PRICING.esa_one_time_2_3}); the annual plan is ${KB_PRICING.esa_annual_1} (2-3 pets: ${KB_PRICING.esa_annual_2_3}). PSD letters are the same pricing.`,
  paw20:
    `Totally understand. ${KB_DISCOUNT.phrase}`,
  landlord_verification:
    `Yes — landlords can verify PawTenant documentation using the verification details on the letter. How it works: ${KB_LINKS.verify_howto}`,
  timing:
    "Most approved letters are delivered within 24 hours — many the same day, depending on provider review and the details you submit. You can track it in My Orders.",
  upload_documents:
    "You can upload or review your information from My Orders. If you have trouble logging in, reply with the email used at checkout and our team can help.",
  psd_explainer:
    "PawTenant PSD documentation can support housing-related accommodation needs as well as travel contexts for eligible psychiatric service dog situations — a PSD is task-trained for a disability-related need, and the letter itself doesn't create service-dog status. A licensed provider reviews every request.",
  psd_paid_housing:
    "Thanks for explaining — PSD documentation can support housing-related accommodation needs as well. I'm sorry for the confusion. Since you've already submitted and paid, I'm flagging this for our support team to review your order and make sure you receive the right guidance.",
  psd_housing_general:
    `PSD documentation may support housing-related accommodation needs for eligible psychiatric service dog situations. You can start here: ${KB_LINKS.psd_start}`,
  legal_escalation:
    "I'm sorry you're dealing with that. Because eviction and legal issues can be time-sensitive, I'm flagging this for our support team to review directly. PawTenant can help with letter verification and documentation support, but we can't provide legal advice.",
  refund_escalation:
    "Thanks for reaching out. Refund and payment questions are reviewed by our team against our policy — I've flagged your message so a team member can follow up with you directly.",
} as const;

// ── H. Housing-denial refund evidence (INTERNAL support/refund-review reference) ─
// For the support/finance team AFTER a customer has requested a housing-denial
// refund review. This is deliberately NOT wired into buildKnowledgePromptSection
// and must NOT be volunteered proactively or shown before a review is requested.
// Evidence is case-specific — no single item is required or automatically
// sufficient. A HUD/agency reference is optional (only when filed). PawTenant
// reviews only whether its own Refund Policy applies and never determines
// whether a law was violated. Full rules: https://pawtenant.com/refund-policy
export const KB_HOUSING_DENIAL_EVIDENCE_EXAMPLES: readonly string[] = [
  "A written denial from the landlord or property manager (letter, notice, or email).",
  "A resident-portal message or screenshot showing the refusal.",
  "A lease-enforcement communication or formal notice.",
  "A written reason the accommodation was refused.",
  "Confirmation the customer submitted their accommodation request and PawTenant letter.",
  "A message requesting additional documentation.",
  "If filed, a HUD or state/local fair-housing complaint reference (optional, where available — never the sole required proof).",
  "Attorney or fair-housing-organization correspondence.",
];

export const KB_HOUSING_DENIAL_EVIDENCE_NOTE =
  "Examples of evidence PawTenant may consider — case-specific, and no single item guarantees approval. PawTenant may request additional information reasonably necessary to verify the accommodation request, the housing provider's response, and eligibility under the Refund Policy. This is a refund-eligibility review, not a legal determination about the landlord.";

// ── Price-objection detection (metadata only — never a policy gate relaxer) ──
// Used by the inbound functions to tag events/notifications so the admin UI
// can show "Price Objection" / "Discount Offered" chips, and to ENFORCE the
// paid-order + once-per-conversation restrictions server-side.
// Broadened 2026-07-07 (CHAT-PREMSG-HERO-REVISION-001): the old regex missed
// plain "its really expensive" and "can I have a discount", so the PAW20 gate
// treated a discount ask as NOT-a-price-objection and mis-routed it to a refund
// escalation. This catches discount/coupon/promo/expensive/afford/cheaper asks
// directly. It must NOT match a neutral price QUESTION ("how much does it
// cost?") — those have no expensive/discount/afford token and stay `pricing`.
const PRICE_OBJECTION_RE =
  /\b(too (expensive|much|pricey|costly)|(can'?t|cannot|hard to|struggle to) afford|afford it|(that'?s|it'?s|its|is) (a lot|expensive|pricey|steep|too much|high)|so (expensive|pricey)|expensive|price is (high|too)|cheaper|lower(ing)? (the )?price|reduce (the )?price|discount|coupon|promo|voucher|any deals?|money('?s| is) tight|on a (tight )?budget|student discount)\b/i;

export function detectPriceObjection(text: string | null | undefined): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  return PRICE_OBJECTION_RE.test(t);
}

export function mentionsDiscountCode(text: string | null | undefined): boolean {
  return /\bPAW20\b/i.test(text || "");
}

// ── Chat "Always Answer" policy (documentation + prompt guidance) ─────────────
// Chat sends a customer-visible reply to EVERY message unless the session is
// blacklisted or chat AI is globally off. Risky topics (legal/crisis/fraud/
// refund) are answered with SAFE FIXED TEMPLATES chosen by the pipeline — the
// model does NOT write those. SMS stays stricter: it still only auto-sends
// SAFE categories and never auto-sends risky ones (draft/escalate instead).
export const KB_CHAT_ALWAYS_ANSWER: readonly string[] = [
  "Chat always sends a customer-visible reply — never leave a visitor unanswered.",
  "For a clear support/service question, answer it directly and helpfully.",
  "For a vague or unclear message, ask ONE short clarifying question instead of guessing.",
  "For legal/eviction, refund/payment, complaint, fraud, or medical/crisis topics, the pipeline sends a SAFE holding/refusal/crisis template and flags a human — you never give legal or medical advice.",
  "SMS is stricter than chat: SMS keeps risky topics as draft/escalate and never auto-sends them.",
];

// ── Prompt section builder (consumed by prompt.ts) ────────────────────────────
export function buildKnowledgePromptSection(): string {
  return `# Always answer (chat)
- Never leave a visitor without a reply. Answer clear questions directly.
- If a message is vague or you are unsure what they need, ask ONE short clarifying question (e.g. "Are you asking about an ESA letter, a PSD letter, your order status, or landlord verification?") and set safe_to_send=true — a clarifying question is always safe.
- Do NOT attempt legal, medical, refund, or fraud answers; keep safe_to_send=false and needs_admin_review=true for those, and the system will send a safe holding reply.

# Knowledge Base (the ONLY facts, links and discount you may use)
Facts:
${KB_SERVICE_FACTS.map((f) => `- ${f}`).join("\n")}

# Website links — share ONLY these exact URLs, only when useful or asked
${KB_LINK_INTENTS.map((l) => `- ${l.intent}: ${l.url}`).join("\n")}
- Never share any other URL, never guess paths, never use www., never shorten links.
- Include at most ONE link per reply, and only when it directly helps.

# Discount rule — the only discount that exists
- If (and only if) the customer objects to the price, says it's too expensive, can't afford it, or asks for a discount/coupon/promo: you may say exactly "${KB_DISCOUNT.phrase}"
- ${KB_DISCOUNT.rules.slice(1).join("\n- ")}
- If the conversation suggests an EXISTING order/payment/billing problem, do NOT mention the code — set needs_admin_review=true instead so the team handles it.`;
}
