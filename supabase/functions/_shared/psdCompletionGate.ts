// _shared/psdCompletionGate.ts
//
// PSD-ASSESSMENT-ANSWERS-PERSISTENCE-AND-RECOVERY-001
//
// The server-authoritative answer to one question: does this PSD order have the
// clinical answers a provider needs?
//
// WHY THIS IS SERVER-SIDE
// -----------------------
// The customer-facing form already refuses to advance without all 16 required
// answers — and that refusal is worth nothing on its own. It lives in the
// browser, the endpoints behind it accept the public anon key, and the whole
// reason this task exists is that an order reached "ready for checkout" state
// with an empty clinical record. A disabled button is a courtesy; this is the
// gate.
//
// It reads `psd_assessment_status`, which derives completeness from the
// authoritative per-answer rows and the required-question registry — never from
// the client's claim and never from the projected JSON blob.
//
// NEVER returns answer VALUES. Counts and missing question IDs only, so a gate
// rejection can be logged and shown to Admin without spreading mental-health
// intake into logs, API responses or error strings.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface PsdGateResult {
  /** True when the action may proceed. Non-PSD orders always pass. */
  allowed: boolean;
  isPsd: boolean;
  requiredTotal: number;
  answered: number;
  missingCount: number;
  /** Question IDs only — never values. */
  missing: string[];
  /** Safe to show a customer. */
  customerMessage?: string;
  /** Safe to show Admin/staff. */
  adminMessage?: string;
}

const CUSTOMER_MESSAGE =
  "Please complete the remaining assessment questions before continuing to payment.";
const ADMIN_MESSAGE = "PSD assessment incomplete — required answers missing.";

/**
 * Evaluate the gate for an order.
 *
 * FAILS OPEN ONLY for non-PSD orders. If the status cannot be determined for a
 * PSD order the gate CLOSES: refusing a payment is recoverable in seconds,
 * whereas letting a provider receive an empty psychiatric assessment is not.
 */
export async function checkPsdAssessmentComplete(
  client: ReturnType<typeof createClient>,
  orderId: string | null | undefined,
): Promise<PsdGateResult> {
  const closed = (extra: Partial<PsdGateResult> = {}): PsdGateResult => ({
    allowed: false, isPsd: true, requiredTotal: 0, answered: 0,
    missingCount: 0, missing: [],
    customerMessage: CUSTOMER_MESSAGE, adminMessage: ADMIN_MESSAGE, ...extra,
  });

  if (!orderId) return closed({ adminMessage: "PSD gate: no order id supplied." });

  type PsdStatus = {
    is_psd?: boolean; required_total?: number; answered?: number;
    missing_count?: number; missing?: string[]; complete?: boolean;
  };

  const readStatus = async (): Promise<PsdStatus | null> => {
    const { data, error } = await client.rpc("psd_assessment_status", { p_order_id: orderId });
    if (error || !data) {
      console.error("[psdCompletionGate] status unavailable:", error?.message ?? "no data");
      return null;
    }
    return data as PsdStatus;
  };

  try {
    let s = await readStatus();
    if (!s) {
      return closed({ adminMessage: "PSD assessment status could not be verified — blocked." });
    }

    // A non-PSD order has no PSD questionnaire to complete. Passing it through
    // is correct, not a hole: ESA has its own flow.
    if (s.is_psd !== true) {
      return {
        allowed: true, isPsd: false, requiredTotal: 0, answered: 0,
        missingCount: 0, missing: [],
      };
    }

    // ── Legacy-projection compatibility ───────────────────────────────────
    // PSD-CHECKOUT-CANONICAL-ANSWER-GATE-LIVE-INCIDENT-002.
    //
    // The canonical model can be empty for an order whose customer genuinely
    // answered everything: the per-answer writer depends on an autosave
    // credential, and where that credential was never issued the answers only
    // ever reached the projection on the order. Those customers completed the
    // assessment and were then refused payment for questions they had answered.
    //
    // So before refusing, give the order one chance to rebuild its canonical
    // record from values it already holds. The RPC is the authority on whether
    // that is legitimate — it repairs only an unpaid PSD order whose projection
    // answers EVERY required question of the version it was actually asked, it
    // promotes no blanks, and it cannot overwrite a newer answer. An incomplete
    // assessment is refused there and stays blocked here.
    //
    // Re-read after a repair rather than trusting its return value: the gate
    // must always be the status RPC's verdict, never a caller's optimism.
    if (s.complete !== true) {
      try {
        const { data: repair, error: repairErr } = await client.rpc(
          "psd_repair_answers_from_projection", { p_order_id: orderId },
        );
        if (repairErr) {
          console.warn("[psdCompletionGate] projection repair failed:", repairErr.message);
        } else if ((repair as { repaired?: boolean } | null)?.repaired === true) {
          console.info(
            `[psdCompletionGate] ${orderId}: rebuilt canonical answers from projection`,
            JSON.stringify(repair),
          );
          const after = await readStatus();
          if (after) s = after;
        }
      } catch (e) {
        // A failed repair must never turn a block into an error. Stay closed.
        console.warn("[psdCompletionGate] projection repair threw:", String(e));
      }
    }

    const missing = Array.isArray(s.missing) ? s.missing : [];
    const complete = s.complete === true;
    return {
      allowed: complete,
      isPsd: true,
      requiredTotal: Number(s.required_total ?? 0),
      answered: Number(s.answered ?? 0),
      missingCount: Number(s.missing_count ?? missing.length),
      missing,
      customerMessage: complete ? undefined : CUSTOMER_MESSAGE,
      adminMessage: complete ? undefined : ADMIN_MESSAGE,
    };
  } catch (e) {
    console.error("[psdCompletionGate] threw:", String(e));
    return closed({ adminMessage: "PSD assessment status check failed — blocked." });
  }
}
