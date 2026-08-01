// src/lib/resumeLink.ts
//
// ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001 §F / §K
//
// Client helper for an AUTHENTICATED customer (or admin) to obtain a secure
// resume link for an order they are entitled to.
//
// The browser deliberately cannot mint a credential. It asks the
// `issue-resume-link` Edge Function, which re-derives the caller's identity
// from their JWT and refuses anything that is not their own order. The returned
// URL carries a one-time token that the assessment page scrubs from the address
// bar the moment it loads.
//
// Nothing here stores the token. It goes straight into a navigation.

import { supabase } from "./supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

export interface ResumeLinkResult {
  ok: boolean;
  url?: string;
  /** Set when the order is genuinely no longer resumable (paid/cancelled/etc). */
  notIssuable?: boolean;
  error?: string;
}

/**
 * Request a secure resume link for one order.
 *
 * Returns `ok:false` with `notIssuable` when the order can no longer be
 * resumed, so callers can show an accurate message instead of a dead link.
 */
export async function requestResumeLink(opts: {
  confirmationId: string;
  isPsd?: boolean;
}): Promise<ResumeLinkResult> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return { ok: false, error: "Please sign in to continue your booking." };

    const res = await fetch(`${SUPABASE_URL}/functions/v1/issue-resume-link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        confirmationId: opts.confirmationId,
        isPsd: !!opts.isPsd,
        purpose: "resume_assessment",
      }),
    });

    const json = await res.json() as {
      ok?: boolean;
      url?: string;
      code?: string;
      error?: string;
    };

    if (json.ok && json.url) return { ok: true, url: json.url };
    return {
      ok: false,
      notIssuable: json.code === "not_issuable",
      error: json.error ?? "Could not create a secure link. Please try again.",
    };
  } catch {
    return { ok: false, error: "Could not create a secure link. Please try again." };
  }
}
