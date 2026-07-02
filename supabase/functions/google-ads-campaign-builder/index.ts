// google-ads-campaign-builder — guarded Google Ads campaign creation.
//
// Modes:
//   validate      — guardrail validation; optional Google Ads validateOnly mutate
//                   (creates NOTHING in Google Ads).
//   save_draft    — validate + store draft in google_ads_campaign_drafts.
//   approve_draft — owner/admin_manager marks a passing draft approved.
//   apply_paused  — owner/admin_manager creates the campaign in Google Ads as
//                   PAUSED only. Requires prior approval + confirmApply=true.
//
// NOT implemented on purpose: apply_enabled, edits/budget/keyword changes to
// existing campaigns, auto-enable, PMax/Display/Smart campaigns. This function
// only CREATES new PAUSED Search campaigns.
//
// Secrets (names only, values never logged or returned):
//   GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_OAUTH_CLIENT_ID,
//   GOOGLE_ADS_OAUTH_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN,
//   GOOGLE_ADS_LOGIN_CUSTOMER_ID (fallback 7629508384),
//   GOOGLE_ADS_API_VERSION (fallback v20).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ALLOWED_CUSTOMER_ID,
  ALLOWED_LOGIN_CUSTOMER_ID,
  validateCampaignDraft,
  type CampaignDraft,
  type DraftValidationResult,
} from "./validator.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_ADS_DEVELOPER_TOKEN = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
const GOOGLE_ADS_OAUTH_CLIENT_ID = Deno.env.get("GOOGLE_ADS_OAUTH_CLIENT_ID");
const GOOGLE_ADS_OAUTH_CLIENT_SECRET = Deno.env.get("GOOGLE_ADS_OAUTH_CLIENT_SECRET");
const GOOGLE_ADS_REFRESH_TOKEN = Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN");
const GOOGLE_ADS_LOGIN_CUSTOMER_ID =
  (Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? ALLOWED_LOGIN_CUSTOMER_ID).replace(/[-\s]/g, "");
const GOOGLE_ADS_API_VERSION = Deno.env.get("GOOGLE_ADS_API_VERSION") || "v20";

const APPLY_ROLES = new Set(["owner", "admin_manager"]);
const BLOCKED_ROLES = new Set(["support", "finance", "read_only", "provider"]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ── Redaction — strip anything secret-shaped before storing/logging ──────────
const SECRET_KEY_RE = /token|secret|password|authorization|api[-_]?key|credential/i;

function redactDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) ? "[REDACTED]" : redactDeep(v);
    }
    return out;
  }
  return value;
}

// ── Secrets preflight — report exactly which required secret NAMES are unset ──
function listMissingGoogleAdsSecrets(): string[] {
  return [
    !GOOGLE_ADS_DEVELOPER_TOKEN && "GOOGLE_ADS_DEVELOPER_TOKEN",
    !GOOGLE_ADS_OAUTH_CLIENT_ID && "GOOGLE_ADS_OAUTH_CLIENT_ID",
    !GOOGLE_ADS_OAUTH_CLIENT_SECRET && "GOOGLE_ADS_OAUTH_CLIENT_SECRET",
    !GOOGLE_ADS_REFRESH_TOKEN && "GOOGLE_ADS_REFRESH_TOKEN",
  ].filter(Boolean) as string[];
}

// ── OAuth (same refresh-token flow as sync-google-ads-conversions) ───────────
async function getAccessToken(): Promise<{ token: string | null; error?: string }> {
  const missingOauth = listMissingGoogleAdsSecrets().filter((n) => n !== "GOOGLE_ADS_DEVELOPER_TOKEN");
  if (missingOauth.length > 0) {
    return { token: null, error: `Missing Google Ads secret(s): ${missingOauth.join(", ")} — set in TEST Supabase Edge Function secrets (names only, never values in logs)` };
  }
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_ADS_OAUTH_CLIENT_ID,
        client_secret: GOOGLE_ADS_OAUTH_CLIENT_SECRET,
        refresh_token: GOOGLE_ADS_REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
    });
    const text = await res.text();
    if (!res.ok) return { token: null, error: `OAuth token refresh failed (${res.status}): ${text.slice(0, 300)}` };
    const data = JSON.parse(text) as { access_token: string };
    return { token: data.access_token };
  } catch (err) {
    return { token: null, error: `OAuth token fetch error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function adsHeaders(accessToken: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${accessToken}`,
    "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
    "login-customer-id": GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    "Content-Type": "application/json",
  };
}

// ── Build the atomic googleAds:mutate operation list ──────────────────────────
// Temp resource IDs (-1, -2, …) link budget → campaign → ad groups → criteria/ads
// inside one atomic request. partialFailure=false so it's all-or-nothing;
// validateOnly=true validates the whole tree without creating anything.

const GEO_US = "geoTargetConstants/2840";
const LANG_EN = "languageConstants/1000";

interface BuiltMutate {
  operations: Record<string, unknown>[];
  opLabels: string[]; // human label per operation index, for mapping resource names
}

function buildMutateOperations(draft: CampaignDraft): BuiltMutate {
  const cid = ALLOWED_CUSTOMER_ID;
  const operations: Record<string, unknown>[] = [];
  const opLabels: string[] = [];
  let tempId = -1;
  const nextTemp = () => tempId--;

  const budgetRes = `customers/${cid}/campaignBudgets/${nextTemp()}`;
  operations.push({
    campaignBudgetOperation: {
      create: {
        resourceName: budgetRes,
        name: `${draft.name} — Daily Budget`,
        amountMicros: String(Math.round(Number(draft.dailyBudgetPkr) * 1_000_000)),
        deliveryMethod: "STANDARD",
        explicitlyShared: false,
      },
    },
  });
  opLabels.push("campaign_budget");

  const campaignRes = `customers/${cid}/campaigns/${nextTemp()}`;
  const campaign: Record<string, unknown> = {
    resourceName: campaignRes,
    name: draft.name,
    // Guardrail: PAUSED is hard-coded here — draft.status is validated upstream
    // but never trusted for this field.
    status: "PAUSED",
    advertisingChannelType: "SEARCH",
    campaignBudget: budgetRes,
    networkSettings: {
      targetGoogleSearch: true,
      targetSearchNetwork: draft.networks?.searchPartners === true && draft.allowSearchPartners === true,
      targetContentNetwork: false,
      targetPartnerSearchNetwork: false,
    },
    geoTargetTypeSetting: {
      positiveGeoTargetType: "PRESENCE",
      negativeGeoTargetType: "PRESENCE",
    },
    containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
  };
  const strategy = String(draft.bidding?.strategy ?? "MAXIMIZE_CONVERSIONS").toUpperCase();
  if (strategy === "MAXIMIZE_CLICKS") {
    campaign.targetSpend = {};
  } else if (strategy === "TARGET_CPA") {
    campaign.maximizeConversions = {
      targetCpaMicros: String(Math.round(Number(draft.bidding?.targetCpaPkr ?? 0) * 1_000_000)),
    };
  } else {
    campaign.maximizeConversions = {};
  }
  operations.push({ campaignOperation: { create: campaign } });
  opLabels.push("campaign");

  // Location + language criteria (validator restricts to US + English in v1).
  // Google Ads REST requires the constant nested inside its info object:
  // location → { geoTargetConstant }, language → { languageConstant }.
  operations.push({
    campaignCriterionOperation: { create: { campaign: campaignRes, location: { geoTargetConstant: GEO_US } } },
  });
  opLabels.push("campaign_criterion_location_us");
  operations.push({
    campaignCriterionOperation: { create: { campaign: campaignRes, language: { languageConstant: LANG_EN } } },
  });
  opLabels.push("campaign_criterion_language_en");

  // Campaign-level negative keywords
  for (const neg of draft.campaignNegatives ?? []) {
    operations.push({
      campaignCriterionOperation: {
        create: {
          campaign: campaignRes,
          negative: true,
          keyword: { text: neg.text.trim(), matchType: String(neg.matchType).toUpperCase() },
        },
      },
    });
    opLabels.push(`campaign_negative:${neg.text.trim()}`);
  }

  // Ad groups + keywords + RSAs
  for (const ag of draft.adGroups ?? []) {
    const agRes = `customers/${cid}/adGroups/${nextTemp()}`;
    operations.push({
      adGroupOperation: {
        create: {
          resourceName: agRes,
          name: ag.name,
          campaign: campaignRes,
          status: "ENABLED", // safe: parent campaign is PAUSED, nothing serves
          type: "SEARCH_STANDARD",
        },
      },
    });
    opLabels.push(`ad_group:${ag.name}`);

    for (const kw of ag.keywords ?? []) {
      operations.push({
        adGroupCriterionOperation: {
          create: {
            adGroup: agRes,
            status: "ENABLED",
            keyword: { text: kw.text.trim(), matchType: String(kw.matchType).toUpperCase() },
          },
        },
      });
      opLabels.push(`keyword:${ag.name}:${kw.text.trim()}`);
    }

    for (const neg of ag.negativeKeywords ?? []) {
      operations.push({
        adGroupCriterionOperation: {
          create: {
            adGroup: agRes,
            negative: true,
            keyword: { text: neg.text.trim(), matchType: String(neg.matchType).toUpperCase() },
          },
        },
      });
      opLabels.push(`negative_keyword:${ag.name}:${neg.text.trim()}`);
    }

    for (const rsa of ag.responsiveSearchAds ?? []) {
      const adPayload: Record<string, unknown> = {
        finalUrls: ag.finalUrls,
        responsiveSearchAd: {
          headlines: rsa.headlines.filter((h) => h && h.trim()).map((h) => ({ text: h.trim() })),
          descriptions: rsa.descriptions.filter((d) => d && d.trim()).map((d) => ({ text: d.trim() })),
          ...(rsa.path1?.trim() ? { path1: rsa.path1.trim() } : {}),
          ...(rsa.path2?.trim() ? { path2: rsa.path2.trim() } : {}),
        },
      };
      operations.push({
        adGroupAdOperation: {
          create: { adGroup: agRes, status: "ENABLED", ad: adPayload },
        },
      });
      opLabels.push(`rsa:${ag.name}`);
    }
  }

  return { operations, opLabels };
}

interface MutateOutcome {
  success: boolean;
  status: number;
  error?: string;
  resourceNames: { label: string; resourceName: string }[];
  campaignResourceName: string | null;
  rawResponseRedacted: unknown;
}

async function runGoogleAdsMutate(
  operations: Record<string, unknown>[],
  opLabels: string[],
  accessToken: string,
  validateOnly: boolean,
): Promise<MutateOutcome> {
  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${ALLOWED_CUSTOMER_ID}/googleAds:mutate`;
  const body = { mutateOperations: operations, partialFailure: false, validateOnly };

  const res = await fetch(url, { method: "POST", headers: adsHeaders(accessToken), body: JSON.stringify(body) });
  const rawText = await res.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(rawText); } catch {
    return {
      success: false, status: res.status,
      error: `Non-JSON Google Ads response (${res.status}): ${rawText.slice(0, 400)}`,
      resourceNames: [], campaignResourceName: null, rawResponseRedacted: { raw: rawText.slice(0, 800) },
    };
  }

  if (!res.ok) {
    let errMsg = `Google Ads API ${res.status}`;
    try {
      const errObj = data.error as Record<string, unknown> | undefined;
      const details = errObj?.details as Array<Record<string, unknown>> | undefined;
      const gadsErrors = details?.[0]?.errors as Array<Record<string, unknown>> | undefined;
      const msgs = (gadsErrors ?? []).map((e) => {
        const loc = e.location as Record<string, unknown> | undefined;
        const fieldPath = (loc?.fieldPathElements as Array<Record<string, unknown>> | undefined)
          ?.map((f) => `${f.fieldName}${f.index !== undefined ? `[${f.index}]` : ""}`).join(".");
        const opIdx = (loc?.fieldPathElements as Array<Record<string, unknown>> | undefined)
          ?.find((f) => f.fieldName === "mutate_operations" || f.fieldName === "mutateOperations")?.index;
        const opLabel = typeof opIdx === "number" ? ` (op: ${opLabels[opIdx] ?? opIdx})` : "";
        return `${String(e.message ?? JSON.stringify(e.errorCode ?? {}))}${opLabel}${fieldPath ? ` [${fieldPath}]` : ""}`;
      });
      errMsg += msgs.length ? `: ${msgs.join(" | ")}` : `: ${String(errObj?.message ?? "").slice(0, 400)}`;
    } catch {
      errMsg += `: ${JSON.stringify(data).slice(0, 600)}`;
    }
    return {
      success: false, status: res.status, error: errMsg,
      resourceNames: [], campaignResourceName: null,
      rawResponseRedacted: redactDeep(data),
    };
  }

  const responses = (data.mutateOperationResponses as Array<Record<string, Record<string, unknown>>> | undefined) ?? [];
  const resourceNames: { label: string; resourceName: string }[] = [];
  let campaignResourceName: string | null = null;
  responses.forEach((r, i) => {
    const inner = Object.values(r)[0];
    const rn = inner && typeof inner === "object" ? String((inner as Record<string, unknown>).resourceName ?? "") : "";
    if (rn) {
      resourceNames.push({ label: opLabels[i] ?? `op_${i}`, resourceName: rn });
      if ((opLabels[i] ?? "") === "campaign") campaignResourceName = rn;
    }
  });

  return {
    success: true, status: res.status, resourceNames, campaignResourceName,
    rawResponseRedacted: redactDeep(data),
  };
}

// ── Labels — best effort, never fails the apply ───────────────────────────────
async function attachLabels(
  accessToken: string,
  campaignResourceName: string,
  labelNames: string[],
): Promise<{ attached: string[]; warnings: string[] }> {
  const attached: string[] = [];
  const warnings: string[] = [];
  const base = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${ALLOWED_CUSTOMER_ID}`;

  for (const name of labelNames) {
    try {
      // Find existing label
      const searchRes = await fetch(`${base}/googleAds:search`, {
        method: "POST",
        headers: adsHeaders(accessToken),
        body: JSON.stringify({
          query: `SELECT label.resource_name, label.name FROM label WHERE label.name = '${name.replace(/'/g, "\\'")}' AND label.status = 'ENABLED' LIMIT 1`,
        }),
      });
      const searchData = await searchRes.json() as { results?: Array<{ label?: { resourceName?: string } }> };
      let labelRes = searchData.results?.[0]?.label?.resourceName ?? null;

      if (!labelRes) {
        const createRes = await fetch(`${base}/labels:mutate`, {
          method: "POST",
          headers: adsHeaders(accessToken),
          body: JSON.stringify({ operations: [{ create: { name } }] }),
        });
        const createData = await createRes.json() as { results?: Array<{ resourceName?: string }> };
        labelRes = createData.results?.[0]?.resourceName ?? null;
        if (!createRes.ok || !labelRes) {
          warnings.push(`Label "${name}": create failed (${createRes.status})`);
          continue;
        }
      }

      const attachRes = await fetch(`${base}/campaignLabels:mutate`, {
        method: "POST",
        headers: adsHeaders(accessToken),
        body: JSON.stringify({ operations: [{ create: { campaign: campaignResourceName, label: labelRes } }] }),
      });
      if (attachRes.ok) attached.push(name);
      else warnings.push(`Label "${name}": attach failed (${attachRes.status})`);
    } catch (err) {
      warnings.push(`Label "${name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { attached, warnings };
}

// ── Audit log helper (audit_logs uses metadata, not details) ──────────────────
// deno-lint-ignore no-explicit-any
async function auditLog(supabase: any, action: string, objectId: string, actorName: string, actorRole: string, metadata: Record<string, unknown>): Promise<void> {
  try {
    await supabase.from("audit_logs").insert({
      action,
      object_type: "google_ads_campaign_draft",
      object_id: objectId,
      actor_name: actorName,
      actor_role: actorRole,
      description: String(metadata.description ?? ""),
      metadata: redactDeep(metadata),
    });
  } catch { /* non-critical */ }
}

function validationStatusOf(v: DraftValidationResult): string {
  if (!v.valid) return "failed";
  return v.warnings.length > 0 ? "passed_with_warnings" : "passed";
}

// ── Request body ──────────────────────────────────────────────────────────────
interface RequestBody {
  mode?: "validate" | "save_draft" | "approve_draft" | "apply_paused";
  draft?: CampaignDraft;
  draftId?: string;
  title?: string;
  googleAdsValidateOnly?: boolean; // validate mode: also run API validateOnly
  confirmApply?: boolean;          // apply_paused requires true
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    // ── Admin auth (same pattern as send-admin-email) ─────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ ok: false, error: "Missing auth token" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return json({ ok: false, error: "Invalid session" }, 401);

    const { data: profile } = await supabase
      .from("doctor_profiles")
      .select("is_admin, is_active, full_name, role")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    const role = String(profile?.role ?? "");
    const isAdmin = !!(profile?.is_admin && profile?.is_active);
    if (!isAdmin || BLOCKED_ROLES.has(role)) {
      return json({ ok: false, error: "Admin access required (owner / admin_manager)" }, 403);
    }
    const actorName = profile?.full_name || userData.user.email || "admin";
    const actorId = userData.user.id;
    const canApprove = APPLY_ROLES.has(role);

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const mode = body.mode ?? "validate";

    // ── validate ──────────────────────────────────────────────────────────────
    if (mode === "validate") {
      const draft = body.draft;
      if (!draft) return json({ ok: false, error: "draft is required" }, 400);
      const validation = validateCampaignDraft(draft);

      let apiValidation: { ran: boolean; success?: boolean; error?: string } = { ran: false };
      const missingSecretsForApi = listMissingGoogleAdsSecrets();
      if (body.googleAdsValidateOnly === true && validation.valid && missingSecretsForApi.length > 0) {
        apiValidation = { ran: false, error: `Missing Google Ads secret(s): ${missingSecretsForApi.join(", ")} — set in TEST Supabase Edge Function secrets to enable API validate-only` };
      } else if (body.googleAdsValidateOnly === true && validation.valid) {
        // Google Ads validateOnly — validates the full create tree, creates nothing.
        const tokenResult = await getAccessToken();
        if (!tokenResult.token) {
          apiValidation = { ran: false, error: tokenResult.error };
        } else {
          const { operations, opLabels } = buildMutateOperations(draft);
          const outcome = await runGoogleAdsMutate(operations, opLabels, tokenResult.token, true);
          apiValidation = { ran: true, success: outcome.success, error: outcome.error };

          if (body.draftId) {
            await supabase.from("google_ads_campaign_apply_results").insert({
              draft_id: body.draftId,
              mode: "validate_only",
              request_json_redacted: redactDeep({ operationCount: operations.length, opLabels }),
              response_json_redacted: outcome.rawResponseRedacted,
              created_resource_names: [],
              errors: outcome.success ? [] : [outcome.error ?? "unknown"],
              created_by: actorId,
              created_by_name: actorName,
            });
            await supabase.from("google_ads_campaign_drafts").update({
              apply_status: outcome.success ? "api_validated" : "not_applied",
              updated_at: new Date().toISOString(),
            }).eq("id", body.draftId);
          }
        }
      }

      if (body.draftId) {
        await supabase.from("google_ads_campaign_drafts").update({
          validation_status: validationStatusOf(validation),
          validation_errors: validation.errors,
          validation_warnings: validation.warnings,
          updated_at: new Date().toISOString(),
        }).eq("id", body.draftId);
      }

      await auditLog(supabase, validation.valid ? "google_ads_campaign_draft_validated" : "google_ads_campaign_draft_validation_failed",
        body.draftId ?? draft.name ?? "unsaved", actorName, role, {
          description: `Campaign draft validated: ${validation.valid ? "PASSED" : "FAILED"} (${validation.errors.length} errors, ${validation.warnings.length} warnings)`,
          errors: validation.errors, warnings: validation.warnings,
          apiValidateOnly: apiValidation,
        });

      return json({ ok: true, mode, validation, apiValidation });
    }

    // ── save_draft ────────────────────────────────────────────────────────────
    if (mode === "save_draft") {
      const draft = body.draft;
      if (!draft) return json({ ok: false, error: "draft is required" }, 400);
      const validation = validateCampaignDraft(draft);
      const title = String(body.title ?? draft.name ?? "Untitled draft").slice(0, 200);

      const row = {
        title,
        draft_json: draft,
        validation_status: validationStatusOf(validation),
        validation_errors: validation.errors,
        validation_warnings: validation.warnings,
        google_ads_customer_id: ALLOWED_CUSTOMER_ID,
        updated_at: new Date().toISOString(),
      };

      let draftId = body.draftId ?? null;
      if (draftId) {
        const { data: existing } = await supabase.from("google_ads_campaign_drafts")
          .select("id, apply_status").eq("id", draftId).maybeSingle();
        if (!existing) return json({ ok: false, error: "Draft not found" }, 404);
        if (existing.apply_status === "applied_paused") {
          return json({ ok: false, error: "Draft was already applied — save changes as a new draft instead" }, 409);
        }
        // Editing invalidates any previous approval
        const { error: updErr } = await supabase.from("google_ads_campaign_drafts")
          .update({ ...row, approved_by: null, approved_by_name: null, approved_at: null })
          .eq("id", draftId);
        if (updErr) return json({ ok: false, error: `Save failed: ${updErr.message}` }, 500);
      } else {
        const { data: inserted, error: insErr } = await supabase.from("google_ads_campaign_drafts")
          .insert({ ...row, created_by: actorId, created_by_name: actorName })
          .select("id").single();
        if (insErr || !inserted) return json({ ok: false, error: `Save failed: ${insErr?.message ?? "unknown"}` }, 500);
        draftId = inserted.id as string;
      }

      await auditLog(supabase, "google_ads_campaign_draft_created", draftId!, actorName, role, {
        description: `Campaign draft saved: "${title}" (validation: ${validationStatusOf(validation)})`,
        validation_status: validationStatusOf(validation),
        errors: validation.errors, warnings: validation.warnings,
      });

      return json({ ok: true, mode, draftId, validation });
    }

    // ── approve_draft ─────────────────────────────────────────────────────────
    if (mode === "approve_draft") {
      if (!canApprove) return json({ ok: false, error: "Only owner / admin_manager can approve drafts" }, 403);
      if (!body.draftId) return json({ ok: false, error: "draftId is required" }, 400);

      const { data: draftRow } = await supabase.from("google_ads_campaign_drafts")
        .select("id, title, draft_json, validation_status, apply_status").eq("id", body.draftId).maybeSingle();
      if (!draftRow) return json({ ok: false, error: "Draft not found" }, 404);
      if (draftRow.apply_status === "applied_paused") return json({ ok: false, error: "Draft already applied" }, 409);

      // Re-validate at approval time — never approve on stale validation state.
      const validation = validateCampaignDraft(draftRow.draft_json as CampaignDraft);
      if (!validation.valid) {
        await supabase.from("google_ads_campaign_drafts").update({
          validation_status: "failed",
          validation_errors: validation.errors,
          validation_warnings: validation.warnings,
          updated_at: new Date().toISOString(),
        }).eq("id", body.draftId);
        return json({ ok: false, error: "Draft fails validation — fix errors before approving", validation }, 422);
      }

      const now = new Date().toISOString();
      await supabase.from("google_ads_campaign_drafts").update({
        validation_status: validationStatusOf(validation),
        validation_errors: validation.errors,
        validation_warnings: validation.warnings,
        approved_by: actorId,
        approved_by_name: actorName,
        approved_at: now,
        updated_at: now,
      }).eq("id", body.draftId);

      await auditLog(supabase, "google_ads_campaign_draft_approved", body.draftId, actorName, role, {
        description: `Campaign draft approved: "${draftRow.title}"`,
        warnings: validation.warnings,
      });

      return json({ ok: true, mode, draftId: body.draftId, approvedAt: now, validation });
    }

    // ── apply_paused ──────────────────────────────────────────────────────────
    if (mode === "apply_paused") {
      if (!canApprove) return json({ ok: false, error: "Only owner / admin_manager can create campaigns" }, 403);
      if (!body.draftId) return json({ ok: false, error: "draftId is required" }, 400);
      if (body.confirmApply !== true) return json({ ok: false, error: "confirmApply=true is required to create a real (PAUSED) campaign" }, 400);

      const { data: draftRow } = await supabase.from("google_ads_campaign_drafts")
        .select("id, title, draft_json, approved_at, apply_status").eq("id", body.draftId).maybeSingle();
      if (!draftRow) return json({ ok: false, error: "Draft not found" }, 404);
      if (draftRow.apply_status === "applied_paused") return json({ ok: false, error: "Draft already applied — check google_ads_campaign_resource_name" }, 409);
      if (!draftRow.approved_at) return json({ ok: false, error: "Draft must be approved before it can be applied" }, 403);

      const draft = draftRow.draft_json as CampaignDraft;
      // Defense in depth: re-validate immediately before any mutation.
      const validation = validateCampaignDraft(draft);
      if (!validation.valid) {
        return json({ ok: false, error: "Draft fails validation — apply blocked", validation }, 422);
      }
      if (String(draft.status).toUpperCase() !== "PAUSED") {
        return json({ ok: false, error: "Draft status must be PAUSED" }, 422);
      }

      const missingSecrets = listMissingGoogleAdsSecrets();
      if (missingSecrets.length > 0) {
        return json({ ok: false, error: `Missing Google Ads secret(s): ${missingSecrets.join(", ")} — apply blocked` }, 500);
      }
      const tokenResult = await getAccessToken();
      if (!tokenResult.token) return json({ ok: false, error: `OAuth failed: ${tokenResult.error}` }, 500);

      const { operations, opLabels } = buildMutateOperations(draft);
      const outcome = await runGoogleAdsMutate(operations, opLabels, tokenResult.token, false);
      const now = new Date().toISOString();

      // Record the attempt regardless of outcome
      await supabase.from("google_ads_campaign_apply_results").insert({
        draft_id: body.draftId,
        mode: "apply_paused",
        request_json_redacted: redactDeep({ operationCount: operations.length, opLabels, apiVersion: GOOGLE_ADS_API_VERSION }),
        response_json_redacted: outcome.rawResponseRedacted,
        created_resource_names: outcome.resourceNames,
        errors: outcome.success ? [] : [outcome.error ?? "unknown"],
        created_by: actorId,
        created_by_name: actorName,
      });

      if (!outcome.success) {
        await supabase.from("google_ads_campaign_drafts").update({
          apply_status: "apply_failed",
          updated_at: now,
        }).eq("id", body.draftId);
        await auditLog(supabase, "google_ads_campaign_apply_failed", body.draftId, actorName, role, {
          description: `Campaign apply FAILED: "${draftRow.title}" — ${String(outcome.error).slice(0, 300)}`,
          error: outcome.error,
        });
        return json({ ok: false, mode, error: outcome.error, resourceNames: outcome.resourceNames }, 502);
      }

      // Labels — best effort, never fails the apply
      let labelResult: { attached: string[]; warnings: string[] } = { attached: [], warnings: [] };
      const labelNames = (draft.labels ?? []).map((l) => String(l).trim()).filter(Boolean).slice(0, 5);
      if (outcome.campaignResourceName && labelNames.length > 0) {
        labelResult = await attachLabels(tokenResult.token, outcome.campaignResourceName, labelNames);
      }

      await supabase.from("google_ads_campaign_drafts").update({
        apply_status: "applied_paused",
        applied_at: now,
        google_ads_campaign_resource_name: outcome.campaignResourceName,
        updated_at: now,
      }).eq("id", body.draftId);

      await auditLog(supabase, "google_ads_paused_campaign_created", body.draftId, actorName, role, {
        description: `PAUSED Google Ads campaign created: "${draftRow.title}" → ${outcome.campaignResourceName ?? "(no resource name)"}`,
        campaign_resource_name: outcome.campaignResourceName,
        resource_names: outcome.resourceNames,
        labels_attached: labelResult.attached,
        label_warnings: labelResult.warnings,
      });

      return json({
        ok: true,
        mode,
        draftId: body.draftId,
        status: "PAUSED",
        campaignResourceName: outcome.campaignResourceName,
        resourceNames: outcome.resourceNames,
        labels: labelResult,
        note: "Campaign created PAUSED. Review in Google Ads before enabling.",
      });
    }

    return json({ ok: false, error: `Unknown mode "${mode}"` }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[google-ads-campaign-builder] Unhandled error:", msg);
    return json({ ok: false, error: msg }, 500);
  }
});
