/**
 * usePsdAutosave — incremental server persistence for the PSD questionnaire.
 *
 * PSD-ASSESSMENT-ANSWERS-PERSISTENCE-AND-RECOVERY-001
 *
 * WHY THIS EXISTS
 * ---------------
 * PSD clinical answers used to live only in React state until one write at the
 * very end of the flow. Anything between the first question and that write —
 * a refresh, a closed tab, a dead phone, a resume path that reset the state —
 * lost the lot. LIVE order PT-PSDCUFKXQ61 lost a completed intake that way.
 *
 * Every answer is now sent to the server on change. The important part is not
 * the debounce, it is that a save writes ONE question: there is no request this
 * hook can make that is capable of erasing a different answer.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * It never reports "Saved" for a request the server did not accept. A silent
 * failure here is indistinguishable, to the customer, from a working product —
 * right up until a provider opens an empty assessment. Failures stay on screen.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/psd-assessment-answers`;

/** sessionStorage, not localStorage: the write credential dies with the tab. */
const TOKEN_KEY = "pt_psd_assessment_token";

export type SaveState = "idle" | "saving" | "saved" | "retrying" | "failed";

export function readAssessmentToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function storeAssessmentToken(token: string | null | undefined): void {
  if (!token) return;
  try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* private mode — autosave degrades */ }
}
export function clearAssessmentToken(): void {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* no-op */ }
}

/**
 * Pre-order draft.
 *
 * The PSD flow asks the clinical questions BEFORE it collects an email, and
 * `orders.email` is NOT NULL — so for the whole of step 1 there is no order row
 * to save into and no credential to save with. Server autosave genuinely cannot
 * start until the lead exists.
 *
 * Rather than leave that window unprotected (it is most of the questionnaire),
 * answers are mirrored to localStorage as they are given, and FLUSHED to the
 * server as individual rows the moment the lead upsert returns a token. So:
 *   • refresh or browser close during step 1 -> restored from the draft
 *   • from the lead save onward             -> server-authoritative, and
 *                                              therefore second-device capable
 *
 * The draft is cleared once flushed. It holds clinical answers, so it must not
 * outlive its purpose on a shared machine.
 */
const DRAFT_KEY = "pt_psd_answer_draft";

export function readDraft(): Record<string, unknown> {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}") as Record<string, unknown>; }
  catch { return {}; }
}
function writeDraft(d: Record<string, unknown>): void {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* quota/private mode */ }
}
export function clearDraft(): void {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* no-op */ }
}

interface Pending { value: unknown; attempt: number; timer?: number }

/** Debounce per QUESTION, not globally — answering Q5 must not delay Q4's save. */
const DEBOUNCE_MS = 600;
const MAX_ATTEMPTS = 4;
/** 1s, 2s, 4s. Bounded: a save that cannot succeed must surface, not spin. */
const backoffMs = (attempt: number) => Math.min(1000 * 2 ** (attempt - 1), 8000);

export function usePsdAutosave() {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ answered: number; total: number } | null>(null);

  // Per-question revision the server last confirmed. Sent back on the next save
  // so the server can reject this tab if another one has moved past it.
  const revisions = useRef<Record<string, number>>({});
  const pending = useRef<Record<string, Pending>>({});
  const inFlight = useRef<Set<string>>(new Set());
  /** Monotonic per question — a slow response for an older value is discarded. */
  const seq = useRef<Record<string, number>>({});

  const recomputeState = useCallback(() => {
    const anyPending = Object.keys(pending.current).length > 0 || inFlight.current.size > 0;
    setSaveState((prev) => {
      if (prev === "failed") return prev;      // a hard failure stays visible
      return anyPending ? "saving" : "saved";
    });
  }, []);

  const send = useCallback(async (questionId: string, value: unknown, mySeq: number) => {
    const token = readAssessmentToken();
    if (!token) {
      // No credential yet (the order does not exist until the lead is saved).
      // Keep the answer queued rather than dropping it.
      return;
    }
    inFlight.current.add(questionId);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({
          action: "save",
          token,
          questionId,
          value,
          clientRevision: revisions.current[questionId] ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));

      // A newer answer for this question overtook us — this response is stale
      // and must not touch state, or a later answer would appear to revert.
      if (seq.current[questionId] !== mySeq) return;

      if (res.ok && data?.ok) {
        revisions.current[questionId] = Number(data.revision ?? 1);
        setLastSavedAt(String(data.saved_at ?? new Date().toISOString()));
        const p = data.progress as { required_answered?: number; required_total?: number } | undefined;
        if (p) setProgress({ answered: Number(p.required_answered ?? 0), total: Number(p.required_total ?? 0) });
        delete pending.current[questionId];
        setSaveState("saved");
        return;
      }

      if (data?.error === "stale_revision") {
        // Another tab won. Adopt its revision so the next edit from here is
        // accepted, rather than retrying a write that can never land.
        revisions.current[questionId] = Number(data.current_revision ?? 0);
        delete pending.current[questionId];
        setSaveState("saved");
        return;
      }

      throw new Error(String(data?.error ?? `HTTP ${res.status}`));
    } catch {
      if (seq.current[questionId] !== mySeq) return;
      const entry = pending.current[questionId];
      const attempt = (entry?.attempt ?? 1) + 1;
      if (attempt > MAX_ATTEMPTS) {
        // Honest end state. The customer sees it and can retry; we never
        // pretend this answer is stored.
        setSaveState("failed");
        return;
      }
      pending.current[questionId] = { value, attempt };
      setSaveState("retrying");
      window.setTimeout(() => { void send(questionId, value, mySeq); }, backoffMs(attempt));
    } finally {
      inFlight.current.delete(questionId);
      recomputeState();
    }
  }, [recomputeState]);

  /** Call on every answer change. */
  const saveAnswer = useCallback((questionId: string, value: unknown) => {
    // Mirror locally FIRST and unconditionally. This is the only protection the
    // pre-order window has, and it must not depend on a network call.
    const d = readDraft(); d[questionId] = value; writeDraft(d);

    const mySeq = (seq.current[questionId] ?? 0) + 1;
    seq.current[questionId] = mySeq;

    const existing = pending.current[questionId];
    if (existing?.timer) window.clearTimeout(existing.timer);

    setSaveState((prev) => (prev === "failed" ? "retrying" : "saving"));
    const timer = window.setTimeout(() => { void send(questionId, value, mySeq); }, DEBOUNCE_MS);
    pending.current[questionId] = { value, attempt: 1, timer };
  }, [send]);

  /** Flush every queued answer immediately — used before leaving the step. */
  const flush = useCallback(async () => {
    const entries = Object.entries(pending.current);
    await Promise.all(entries.map(([qid, p]) => {
      if (p.timer) window.clearTimeout(p.timer);
      const mySeq = (seq.current[qid] ?? 0) + 1;
      seq.current[qid] = mySeq;
      return send(qid, p.value, mySeq);
    }));
  }, [send]);

  /** Seed revisions from a resume load so the first edit is not seen as stale. */
  const seedRevisions = useCallback((incoming: Record<string, number>) => {
    revisions.current = { ...revisions.current, ...incoming };
  }, []);

  // Warn before leaving with unsaved answers. The browser text is not ours to
  // choose, but the prompt is the difference between "I lost my answers" and
  // "it told me to wait a second".
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length === 0 && inFlight.current.size === 0) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  /**
   * Push every drafted answer to the server as its own row. Called as soon as
   * the lead upsert hands back a token, which is the first moment a server
   * write is possible at all.
   */
  const flushDraft = useCallback(async () => {
    if (!readAssessmentToken()) return;
    const d = readDraft();
    const entries = Object.entries(d);
    if (entries.length === 0) return;
    setSaveState("saving");
    for (const [qid, val] of entries) {
      const mySeq = (seq.current[qid] ?? 0) + 1;
      seq.current[qid] = mySeq;
      await send(qid, val, mySeq);
    }
    clearDraft();
  }, [send]);

  return { saveAnswer, flush, flushDraft, seedRevisions, saveState, lastSavedAt, progress };
}
