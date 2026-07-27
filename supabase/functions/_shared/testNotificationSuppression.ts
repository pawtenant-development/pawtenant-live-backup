// DOCUMENT-REVISION-ID-AND-CUSTOMER-QA-CLOSURE-001 §10
//
// TEST-ONLY external-notification suppression.
//
// WHY: the deployed provider-submit-letter HTTP path could never be exercised
// end to end, because completing a submission sends a real customer email via
// Resend. Without a safe gate, "test the deployed path" and "send no real
// communications" are mutually exclusive.
//
// THIS IS FAIL-CLOSED AND OFF BY DEFAULT. Suppression requires THREE
// independent conditions to agree; if ANY of them is absent — or if anything
// throws — delivery proceeds normally. There is no way to reach it from the
// browser, from a query parameter, from a request body, or from any value a
// customer or provider controls.
//
//   1. EXPLICIT SECRET  — TEST_SUPPRESS_EXTERNAL_NOTIFICATIONS === "true".
//                         A deliberate, separately-provisioned Supabase secret.
//   2. PROJECT IDENTITY — SUPABASE_URL must be the TEST project ref. LIVE has a
//                         different ref, so even if the secret were somehow set
//                         on LIVE this still refuses.
//   3. FIXTURE RECIPIENT— the recipient address must sit on a reserved
//                         non-deliverable TLD (RFC 2606 `.test` / `.invalid`).
//                         A real customer address can never satisfy this.
//
// Suppression NEVER fabricates a successful delivery. Callers must record the
// honest outcome ("suppressed", not "sent") so a suppressed run can never be
// mistaken for a delivered one.

/** The ONLY project ref on which suppression may ever engage. */
export const TEST_PROJECT_REF = "opudhofjbydrljgleofq";

/** Reserved, non-deliverable TLDs (RFC 2606). A real inbox cannot use these. */
const FIXTURE_TLDS = [".test", ".invalid"];

export interface SuppressionDecision {
  /** True ONLY when every condition agrees. */
  suppressed: boolean;
  /** Honest, non-PII explanation for logs and audit rows. */
  reason: string;
  /** Which conditions passed — recorded so a suppressed run is auditable. */
  checks: {
    secretEnabled: boolean;
    testProject: boolean;
    fixtureRecipient: boolean;
  };
}

/**
 * Convenience for call sites that notify STAFF about a fixture order (e.g. the
 * admin "letter submitted" alert). The gate is keyed on the FIXTURE ORDER's
 * recipient, not on the staff address, so a fixture submission never pages real
 * staff — while an ordinary order still notifies them normally.
 */
export function suppressForFixtureOrder(orderEmail: string | null | undefined): boolean {
  return evaluateNotificationSuppression(orderEmail).suppressed;
}

function isFixtureRecipient(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  if (!e.includes("@")) return false;
  return FIXTURE_TLDS.some((tld) => e.endsWith(tld));
}

/**
 * Decide whether external delivery to `recipientEmail` must be suppressed.
 *
 * Fail-closed: returns suppressed=false unless ALL THREE conditions hold.
 */
export function evaluateNotificationSuppression(
  recipientEmail: string | null | undefined,
): SuppressionDecision {
  const checks = { secretEnabled: false, testProject: false, fixtureRecipient: false };
  try {
    checks.secretEnabled =
      (Deno.env.get("TEST_SUPPRESS_EXTERNAL_NOTIFICATIONS") ?? "").trim().toLowerCase() === "true";

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    checks.testProject = url.includes(TEST_PROJECT_REF);

    checks.fixtureRecipient = isFixtureRecipient(recipientEmail);
  } catch {
    // Any failure reading the environment means we do NOT suppress.
    return {
      suppressed: false,
      reason: "suppression check failed — delivering normally (fail-closed)",
      checks,
    };
  }

  const suppressed = checks.secretEnabled && checks.testProject && checks.fixtureRecipient;

  if (suppressed) {
    return {
      suppressed: true,
      reason:
        "TEST-ONLY suppression: explicit secret + TEST project ref + reserved non-deliverable recipient TLD",
      checks,
    };
  }

  const missing: string[] = [];
  if (!checks.secretEnabled) missing.push("secret");
  if (!checks.testProject) missing.push("test-project");
  if (!checks.fixtureRecipient) missing.push("fixture-recipient");
  return {
    suppressed: false,
    reason: `delivering normally — suppression conditions not met (${missing.join(", ")})`,
    checks,
  };
}
