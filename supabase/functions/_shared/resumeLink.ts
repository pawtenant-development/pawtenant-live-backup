// _shared/resumeLink.ts
//
// ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001 §C
//
// THE ONE canonical resume-link builder. Every server-side producer of a
// recovery / resume link (email, SMS, admin action, drip sequence) must build
// its link through `issueResumeLink()` and nothing else.
//
// Why one implementation:
//   • token generation lives in exactly one place (`issue-resume-token`, which
//     mints 256 bits of CSPRNG entropy and stores only sha256(raw));
//   • every producer inherits the same fail-closed behaviour;
//   • the deploy-blocking guard has a single call-site pattern to assert on.
//
// A confirmation id is a DISPLAY REFERENCE — it appears in mail logs, SMS
// history, analytics, referrers and support threads. It is never a credential
// and this module never puts one in a link.
//
// The raw token is used exactly once, here, to build the URL string. It is
// never logged, never persisted by the caller, and never returned to a browser
// by any function other than as part of the finished link.

export type ResumePurpose = "resume_checkout" | "resume_assessment";

export interface IssueResumeLinkOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
  /** Origin the link points at, e.g. https://pawtenant-test.vercel.app (no trailing slash). */
  siteUrl: string;
  confirmationId: string;
  /** PSD orders resume on /psd-assessment, everything else on /assessment. */
  isPsd?: boolean;
  purpose?: ResumePurpose;
  ttlMinutes?: number;
  /** Recorded on the token row as `created_by` — an actor label, never PII. */
  createdBy: string;
  /**
   * Non-authorizing extra query params (promo code, recovery stage). NEVER put
   * email, phone, order UUID, payment identifiers or intake data here.
   */
  extraParams?: Record<string, string | null | undefined>;
  /** Route through the /r/<stage> click bridge instead of straight to the page. */
  bridgeStage?: string | null;
}

export interface IssuedResumeLink {
  /** The finished URL. Tokenized when `tokenized` is true. */
  url: string;
  /** False when issuance failed — the URL is then a bare, credential-free path. */
  tokenized: boolean;
  expiresAt: string | null;
}

/** Append params to a URL that may or may not already carry a query string. */
function withParams(base: string, params: Record<string, string | null | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== null && v !== undefined && String(v).length > 0,
  );
  if (entries.length === 0) return base;
  const qs = entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return `${base}${base.includes("?") ? "&" : "?"}${qs}`;
}

/**
 * Mint a secure resume credential and return the link that carries it.
 *
 * FAIL-CLOSED. If the order is not resumable (paid / completed / cancelled /
 * refunded / archived / unknown) or issuance is unavailable for any reason, the
 * returned URL is the bare assessment path with **no confirmation id and no
 * token** — the customer lands on the safe "request a new link" screen rather
 * than following a link that leaks an order reference.
 */
export async function issueResumeLink(opts: IssueResumeLinkOptions): Promise<IssuedResumeLink> {
  const {
    supabaseUrl,
    serviceRoleKey,
    siteUrl,
    confirmationId,
    isPsd = false,
    purpose = "resume_assessment",
    ttlMinutes = 4320, // 72 h — the recovery cadence runs to 5 days, so each send
                       // mints a fresh link rather than one long-lived credential.
    createdBy,
    extraParams = {},
    bridgeStage = null,
  } = opts;

  const origin = siteUrl.replace(/\/+$/, "");
  const assessmentPath = isPsd ? "psd-assessment" : "assessment";

  // The safe destination when we cannot mint a credential. Carries no order
  // reference of any kind.
  const safeFallback = withParams(`${origin}/${assessmentPath}`, extraParams);

  if (!confirmationId || !confirmationId.trim()) {
    return { url: safeFallback, tokenized: false, expiresAt: null };
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/issue-resume-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        confirmationId: confirmationId.trim(),
        purpose,
        ttlMinutes,
        createdBy: createdBy.slice(0, 64),
      }),
    });

    const issued = (await res.json()) as { ok?: boolean; token?: string; expiresAt?: string };

    if (!issued?.ok || !issued.token) {
      // Not resumable, or unknown order. Identical handling either way — this
      // function is never an existence oracle for its caller.
      return { url: safeFallback, tokenized: false, expiresAt: null };
    }

    // The /r/ bridge carries the token through so recovery-click attribution
    // still fires, then hands it to the assessment page. `p` is a non-
    // authorizing route hint so the bridge knows ESA vs PSD without reading
    // any order data.
    const base = bridgeStage
      ? withParams(`${origin}/r/${encodeURIComponent(bridgeStage)}`, {
          rt: issued.token,
          p: isPsd ? "psd" : "esa",
        })
      : withParams(`${origin}/${assessmentPath}`, { rt: issued.token });

    return {
      url: withParams(base, extraParams),
      tokenized: true,
      expiresAt: issued.expiresAt ?? null,
    };
  } catch {
    // Never surface the reason — and never fall back to a confirmation-id link.
    return { url: safeFallback, tokenized: false, expiresAt: null };
  }
}
