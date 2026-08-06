// psd-assessment-answers
//
// PSD-ASSESSMENT-ANSWERS-PERSISTENCE-AND-RECOVERY-001
//
// Incremental autosave for the PSD clinical questionnaire, and the only client
// path that can write a clinical answer.
//
// WHY THIS EXISTS
// ---------------
// Answers used to be held in React state and written once, wholesale, at the end
// of the flow. One reset client destroyed a completed intake (LIVE order
// PT-PSDCUFKXQ61: 22 answered fields to 3). Persistence is now per answer, so
// the blast radius of any single write is ONE question — there is no request in
// the system that can erase the rest.
//
// AUTHENTICATION
// --------------
// A confirmation id is NEVER accepted as a credential here. It is a display
// reference that lives in emails, SMS, URLs, analytics and support threads, and
// this endpoint reads and writes mental-health intake.
//
//   save   → requires an order-bound assessment session token (opaque, minted by
//            the lead upsert, stored only as a sha256).
//   load   → same token. Returns answers ONLY for the bound order.
//   status → same token. Counts and missing question IDs only.
//
// There is deliberately no "look up by confirmation id" action.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** sha256 hex — the stored form of a session token. */
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Resolve the presented token to an order id, or null.
 *
 * Every failure mode — absent, malformed, unknown, expired, revoked — returns
 * the SAME null, so this can never be used to probe which confirmation ids or
 * tokens exist.
 */
async function orderForToken(token: string | undefined | null): Promise<string | null> {
  const t = (token ?? "").trim();
  if (!t || t.length < 32) return null;
  try {
    const { data, error } = await supabase.rpc("assessment_session_order", {
      p_token_hash: await sha256Hex(t),
    });
    if (error) return null;
    return (typeof data === "string" && data) ? data : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...CORS, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  let body: {
    action?: string;
    token?: string;
    questionId?: string;
    value?: unknown;
    clientRevision?: number | null;
    assessmentVersion?: string;
    sourceStep?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const orderId = await orderForToken(body.token);
  if (!orderId) {
    // Generic on purpose — never distinguishes "no such order" from "expired".
    return json({ ok: false, error: "This assessment session has expired. Please reopen your assessment link." }, 401);
  }

  // ── save one answer ───────────────────────────────────────────────────────
  if (body.action === "save") {
    if (!body.questionId) return json({ ok: false, error: "questionId is required" }, 400);

    const { data, error } = await supabase.rpc("psd_save_answer", {
      p_order_id: orderId,
      p_question_id: body.questionId,
      p_answer_value: body.value ?? null,
      p_client_revision: body.clientRevision ?? null,
      p_assessment_version: body.assessmentVersion ?? "psd_v1",
      p_source_step: body.sourceStep ?? "psd_step1",
    });

    if (error) {
      // The customer must never see a false "Saved". Surface the failure so the
      // client can show "Save failed — retrying" and retry with backoff.
      console.error("[psd-assessment-answers] save failed:", error.message);
      return json({ ok: false, error: "save_failed", retryable: true }, 503);
    }

    const result = data as Record<string, unknown> | null;
    if (result && result.ok === false) {
      // stale_revision is a normal, expected outcome when two tabs race — it is
      // reported so the client can adopt the winning value, not as an error.
      const status = result.error === "stale_revision" ? 409 : 400;
      return json({ ...result, retryable: false }, status);
    }
    return json(result ?? { ok: false, error: "no_result" });
  }

  // ── load answers for resume ───────────────────────────────────────────────
  if (body.action === "load") {
    const { data: rows, error } = await supabase
      .from("assessment_answers")
      .select("question_id, answer_value, revision, assessment_version, updated_at")
      .eq("order_id", orderId);
    if (error) return json({ ok: false, error: "load_failed" }, 503);

    const answers: Record<string, unknown> = {};
    const revisions: Record<string, number> = {};
    for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
      answers[r.question_id as string] = r.answer_value;
      revisions[r.question_id as string] = Number(r.revision ?? 1);
    }

    const { data: status } = await supabase.rpc("psd_assessment_status", { p_order_id: orderId });
    return json({ ok: true, answers, revisions, status });
  }

  // ── completion status ─────────────────────────────────────────────────────
  if (body.action === "status") {
    const { data: status, error } = await supabase.rpc("psd_assessment_status", { p_order_id: orderId });
    if (error) return json({ ok: false, error: "status_failed" }, 503);
    return json({ ok: true, status });
  }

  return json({ ok: false, error: "Unknown action" }, 400);
});
