// src/lib/resumeTokenParam.ts
//
// ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001 §J
//
// Reads the `?rt=` resume credential for the page that needs it.
//
// WHY THIS EXISTS. The credential used to be read straight off
// `location.search` and scrubbed once React mounted. That is a RACE, and
// production loses it: the tag stack (GTM, Google Ads, GA4, Facebook, Bing)
// fires on page load and reports `dl` / `dr` — the raw tokenised URL — before
// React ever runs. Verified on pawtenant.com: nine third-party beacons carried
// the token, including GA4's `dr` on the /r/ bridge hop.
//
// The address bar is therefore scrubbed synchronously by the pre-boot inline
// script in index.html, which stashes the raw value on `window` IN MEMORY. This
// helper is the only reader of that stash.
//
// The query-string fallback is kept deliberately: it keeps the page working if
// the inline script is ever absent (an old cached index.html, a non-standard
// host). In that case React's own scrub — still present in each page's resume
// effect — remains the backstop.

interface CredentialStash {
  rt?: string;
  resume?: string;
  token?: string;
}

/**
 * Return the raw resume token for this page load, or "" if there is none.
 *
 * Never writes the value anywhere. Callers must exchange it immediately and
 * must not persist it.
 */
export function readResumeToken(search?: URLSearchParams): string {
  try {
    const stash = (window as unknown as { __ptCredentialParams?: CredentialStash })
      .__ptCredentialParams;
    if (stash?.rt) return stash.rt;
  } catch {
    /* non-fatal */
  }
  try {
    const params = search ?? new URLSearchParams(window.location.search);
    return params.get("rt") ?? "";
  } catch {
    return "";
  }
}

/**
 * True when this page load carried a LEGACY `?resume=<confirmationId>` link.
 * A confirmation id is a display reference and unlocks nothing — pages use this
 * only to decide whether to show the safe "request a new link" screen.
 */
export function hadLegacyResumeParam(search?: URLSearchParams): boolean {
  try {
    const stash = (window as unknown as { __ptCredentialParams?: CredentialStash })
      .__ptCredentialParams;
    if (stash?.resume) return true;
  } catch {
    /* non-fatal */
  }
  try {
    const params = search ?? new URLSearchParams(window.location.search);
    return !!params.get("resume");
  } catch {
    return false;
  }
}
