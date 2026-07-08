// ghl.ts — GHL contact DND lookup for DND-safe AI SMS sending.
//
// COMPLIANCE RULE (fail closed): the AI pipeline must never auto-send an SMS
// to a contact whose GHL DND blocks SMS (STOP keyword, manual DND, carrier
// opt-out). If the DND state cannot be verified — missing credentials, API
// error, timeout, contact not found — the caller must NOT send; it downgrades
// to draft and records dnd_unknown_fail_closed.
//
// Uses the same GHL_API_KEY / GHL_LOCATION_ID project secrets as ghl-send-sms.

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_TIMEOUT_MS = 8000;

export type DndStatus = "clear" | "blocked" | "unknown";

export interface DndCheck {
  status: DndStatus;
  /** Audit code stored in ai_support_ai_events.guardrail_code when not clear. */
  code: "dnd_clear" | "dnd_sms_blocked" | "dnd_unknown_fail_closed";
  detail: string;
  contactId: string | null;
}

function unknownResult(detail: string, contactId: string | null = null): DndCheck {
  return { status: "unknown", code: "dnd_unknown_fail_closed", detail, contactId };
}

async function ghlGet(path: string, apiKey: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GHL_TIMEOUT_MS);
  try {
    return await fetch(`${GHL_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Version: "2021-07-28" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check whether outbound SMS to this contact is blocked by GHL DND.
 *   * Prefers an exact contact id (the GHL webhook adapter supplies one);
 *     falls back to a phone search (same lookup ghl-send-sms uses to pick
 *     its send target, so both resolve the same contact).
 *   * Global dnd=true OR dndSettings.SMS.status active/permanent → blocked.
 *   * Contact found and no SMS DND → clear.
 *   * Anything else (no creds, HTTP error, timeout, no contact) → unknown.
 */
export async function checkGhlSmsDnd(
  phone: string,
  knownContactId?: string | null,
): Promise<DndCheck> {
  const apiKey = Deno.env.get("GHL_API_KEY") ?? "";
  const locationId = Deno.env.get("GHL_LOCATION_ID") ?? "";
  if (!apiKey || !locationId) return unknownResult("GHL credentials not configured");

  try {
    let contactId = knownContactId?.trim() || null;
    if (!contactId) {
      const res = await ghlGet(
        `/contacts/?locationId=${locationId}&query=${encodeURIComponent(phone)}`,
        apiKey,
      );
      if (!res.ok) return unknownResult(`contact search HTTP ${res.status}`);
      const data = await res.json().catch(() => null) as { contacts?: Array<{ id?: string }> } | null;
      contactId = data?.contacts?.[0]?.id ?? null;
      if (!contactId) return unknownResult("no GHL contact found for phone");
    }

    const res = await ghlGet(`/contacts/${contactId}`, apiKey);
    if (!res.ok) return unknownResult(`contact fetch HTTP ${res.status}`, contactId);
    // deno-lint-ignore no-explicit-any
    const contact = ((await res.json().catch(() => null)) as any)?.contact;
    if (!contact || typeof contact !== "object") {
      return unknownResult("malformed contact response", contactId);
    }

    if (contact.dnd === true) {
      return { status: "blocked", code: "dnd_sms_blocked", detail: "global DND active", contactId };
    }
    const dndSettings = contact.dndSettings && typeof contact.dndSettings === "object"
      ? contact.dndSettings as Record<string, unknown>
      : {};
    for (const [channel, value] of Object.entries(dndSettings)) {
      if (channel.toLowerCase() !== "sms") continue;
      // deno-lint-ignore no-explicit-any
      const st = String((value as any)?.status ?? "").toLowerCase();
      if (st === "active" || st === "permanent") {
        return { status: "blocked", code: "dnd_sms_blocked", detail: `SMS DND ${st}`, contactId };
      }
    }
    return { status: "clear", code: "dnd_clear", detail: "no SMS DND on contact", contactId };
  } catch (e) {
    const msg = e instanceof Error && e.name === "AbortError" ? "GHL API timeout" : "GHL API unreachable";
    return unknownResult(msg);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Runtime GHL sync — mirror the latest AI Support state onto the GHL contact
// (custom fields + managed state tags) after every processed inbound message.
//
// FAIL-SOFT BY CONTRACT: the caller wraps this in try/catch and the pipeline's
// SMS decision has already been executed before sync runs — a GHL failure can
// only ever cost the mirror update, never change what was sent or drafted.
// Never logs credentials; logs names/counts/status codes only.
// ═══════════════════════════════════════════════════════════════════════════

/** Contact custom fields created for AI Support (Phase 1C). Resolved by name. */
const AI_FIELD_NAMES = {
  status: "AI Support Status",
  channel: "AI Last Channel",
  intent: "AI Last Intent",
  risk: "AI Last Risk Level",
  action: "AI Last Action",
  escalationReason: "AI Last Escalation Reason",
  eligible: "AI Auto Reply Eligible",
  reviewedAt: "AI Last Reviewed At",
} as const;

/** The ONLY tags sync may add AND remove — they reflect the latest event. */
const AI_STATE_TAGS = ["ai human review", "ai escalation needed", "ai dnd sms blocked"] as const;
/** Identity tags: added (never removed) for auto-send whitelist members only. */
const AI_IDENTITY_TAGS = ["ai support test", "ai auto reply whitelist"] as const;

export interface AiSyncState {
  /** Human-scannable outcome, same vocabulary as admin notifications. */
  status: string;
  channel: string;
  intent: string;
  riskLevel: string;
  /** ai_support_ai_events.action value (auto_sent | drafted | escalated | blocked | error). */
  action: string;
  /** Why a human is needed; empty string clears the field on resolved/safe events. */
  escalationReason: string;
  autoReplyEligible: "yes" | "no";
  reviewedAtIso: string;
  /** DND gate outcome for this event (null when the gate did not run). */
  dndBlocked: boolean;
  /** Sender is on the auto-send whitelist → identity tags may be applied. */
  isWhitelisted: boolean;
  /** opt_out events mark the contact SMS-blocked rather than escalation. */
  category: string;
}

export interface GhlSyncResult {
  ok: boolean;
  skipped: string | null;
  contactId: string | null;
  tagsAdded: string[];
  tagsRemoved: string[];
  fieldsUpdated: number;
  error: string | null;
}

let fieldIdCache: { at: number; map: Record<string, string> } | null = null;
const FIELD_CACHE_TTL_MS = 10 * 60 * 1000;

/** Resolve AI custom-field name → id from GHL (module-cached; stale-tolerant). */
async function resolveAiFieldIds(apiKey: string, locationId: string): Promise<Record<string, string> | null> {
  if (fieldIdCache && Date.now() - fieldIdCache.at < FIELD_CACHE_TTL_MS) return fieldIdCache.map;
  try {
    const res = await ghlGet(`/locations/${locationId}/customFields?model=contact`, apiKey);
    if (!res.ok) return fieldIdCache?.map ?? null;
    // deno-lint-ignore no-explicit-any
    const data = (await res.json().catch(() => null)) as any;
    const map: Record<string, string> = {};
    for (const f of Array.isArray(data?.customFields) ? data.customFields : []) {
      if (f?.name && f?.id) map[String(f.name).trim().toLowerCase()] = String(f.id);
    }
    if (Object.keys(map).length === 0) return fieldIdCache?.map ?? null;
    fieldIdCache = { at: Date.now(), map };
    return map;
  } catch (_e) {
    return fieldIdCache?.map ?? null;
  }
}

/** Which state tags this event's outcome earns (replaces the previous set). */
function desiredStateTags(state: AiSyncState): Set<string> {
  const tags = new Set<string>();
  if (state.dndBlocked || state.category === "opt_out") tags.add("ai dnd sms blocked");
  switch (state.action) {
    case "drafted":
    case "error":
      tags.add("ai human review");
      break;
    case "escalated":
      tags.add("ai escalation needed");
      break;
    case "blocked":
      if (state.category !== "opt_out") tags.add("ai escalation needed");
      break;
    // auto_sent / anything else: resolved — state tags clear.
  }
  return tags;
}

/**
 * Sync the latest AI Support state onto the GHL contact:
 *   * one PUT carrying all 8 AI custom fields + the recomputed tag list;
 *   * tag list = (current tags − AI_STATE_TAGS) + earned state tags
 *     (+ identity tags when whitelisted) — unrelated tags are NEVER touched;
 *   * duplicate-safe: tags are set-computed, retries are deduped upstream by
 *     the pipeline's providerMessageId idempotency.
 */
export async function syncAiSupportStateToGhl(
  phone: string,
  knownContactId: string | null,
  state: AiSyncState,
  /** Live-chat fallback: match the GHL contact by email when no phone exists. */
  email?: string | null,
): Promise<GhlSyncResult> {
  const result: GhlSyncResult = {
    ok: false, skipped: null, contactId: null,
    tagsAdded: [], tagsRemoved: [], fieldsUpdated: 0, error: null,
  };
  const apiKey = Deno.env.get("GHL_API_KEY") ?? "";
  const locationId = Deno.env.get("GHL_LOCATION_ID") ?? "";
  if (!apiKey || !locationId) {
    result.skipped = "ghl_credentials_missing";
    return result;
  }

  try {
    // Resolve the contact (exact id from the webhook when available, else the
    // same phone search ghl-send-sms uses to pick its send target; live chat
    // falls back to an email search since visitors rarely share a phone).
    let contactId = knownContactId?.trim() || null;
    if (!contactId) {
      const query = phone?.trim() || email?.trim() || "";
      if (!query) { result.skipped = "no_ghl_contact_key"; return result; }
      const res = await ghlGet(
        `/contacts/?locationId=${locationId}&query=${encodeURIComponent(query)}`,
        apiKey,
      );
      if (!res.ok) { result.error = `contact search HTTP ${res.status}`; return result; }
      const data = await res.json().catch(() => null) as { contacts?: Array<{ id?: string }> } | null;
      contactId = data?.contacts?.[0]?.id ?? null;
    }
    if (!contactId) { result.skipped = "no_ghl_contact"; return result; }
    result.contactId = contactId;

    const contactRes = await ghlGet(`/contacts/${contactId}`, apiKey);
    if (!contactRes.ok) { result.error = `contact fetch HTTP ${contactRes.status}`; return result; }
    // deno-lint-ignore no-explicit-any
    const contact = ((await contactRes.json().catch(() => null)) as any)?.contact;
    if (!contact || typeof contact !== "object") { result.error = "malformed contact response"; return result; }

    const fieldIds = await resolveAiFieldIds(apiKey, locationId);
    if (!fieldIds) { result.error = "field id resolution failed"; return result; }

    // Recompute the tag list: keep everything that is not one of our three
    // state tags, then add this event's state tags (+ identity when allowed).
    const currentTags: string[] = Array.isArray(contact.tags)
      ? contact.tags.map((t: unknown) => String(t).toLowerCase())
      : [];
    const stateTagSet = new Set<string>(AI_STATE_TAGS);
    const desired = new Set<string>(currentTags.filter((t) => !stateTagSet.has(t)));
    for (const t of desiredStateTags(state)) desired.add(t);
    if (state.isWhitelisted) for (const t of AI_IDENTITY_TAGS) desired.add(t);
    const desiredTags = [...desired];
    result.tagsAdded = desiredTags.filter((t) => !currentTags.includes(t));
    result.tagsRemoved = currentTags.filter((t) => !desired.has(t));

    const fieldValues: Array<{ name: keyof typeof AI_FIELD_NAMES; value: string }> = [
      { name: "status", value: state.status },
      { name: "channel", value: state.channel },
      { name: "intent", value: state.intent },
      { name: "risk", value: state.riskLevel },
      { name: "action", value: state.action },
      { name: "escalationReason", value: state.escalationReason.slice(0, 250) },
      { name: "eligible", value: state.autoReplyEligible },
      { name: "reviewedAt", value: state.reviewedAtIso },
    ];
    const customFields: Array<{ id: string; value: string }> = [];
    for (const f of fieldValues) {
      const id = fieldIds[AI_FIELD_NAMES[f.name].toLowerCase()];
      if (id) customFields.push({ id, value: f.value });
    }
    result.fieldsUpdated = customFields.length;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GHL_TIMEOUT_MS);
    let putRes: Response;
    try {
      putRes = await fetch(`${GHL_API_BASE}/contacts/${contactId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Version: "2021-07-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tags: desiredTags, customFields }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!putRes.ok) { result.error = `contact update HTTP ${putRes.status}`; return result; }
    result.ok = true;
    return result;
  } catch (e) {
    result.error = e instanceof Error && e.name === "AbortError" ? "GHL API timeout" : "GHL API unreachable";
    return result;
  }
}
