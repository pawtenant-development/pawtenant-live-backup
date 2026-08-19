// _shared/otpDeliveryPolicy.ts
//
// OTP-EMAIL-PRIMARY-DELIVERY-001 (P0, 2026-08-19)
//
// THE single decision table for what happens to a freshly issued customer OTP
// after its delivery attempts settle. Pure and dependency-free so the pricing
// guard can execute it directly with stubbed outcomes — no Deno, no fetch.
//
// Owner policy:
//   * Email is the PRIMARY channel. SMS is best-effort secondary convenience.
//   * The code stays usable when email OR SMS succeeded.
//   * The code is deleted ONLY when both channels failed — and then only the
//     NEW code, so a failed resend can never destroy a still-valid earlier one.
//   * The customer-facing message must never claim a channel that did not
//     deliver.
//
// The previous behaviour ("BOTH CHANNELS REQUIRED") deleted an email-accepted
// code the moment GHL refused the SMS — a fake or unreachable phone invalidated
// a code the customer was already holding in their inbox.

export interface OtpChannelOutcomes {
  /** Resend accepted the email (HTTP 2xx). Later bounce events don't matter here. */
  emailOk: boolean;
  /** GHL accepted the SMS. */
  smsOk: boolean;
  /** False when no dialable number was available, so SMS was never attempted. */
  smsAttempted: boolean;
}

export interface OtpDeliveryDecision {
  /** The new code remains active and verifiable. */
  keepNewCode: boolean;
  /** Delete ONLY the code issued by this request (both channels failed). */
  deleteNewCode: boolean;
  /** Remove older codes — allowed only once the new code is known-delivered. */
  deletePriorCodes: boolean;
  ok: boolean;
  httpStatus: number;
  /** Accurate, channel-truthful customer message. Never contains the code. */
  message: string;
  channels: { email: boolean; sms: boolean };
}

export function decideOtpDelivery(o: OtpChannelOutcomes): OtpDeliveryDecision {
  const delivered = o.emailOk || o.smsOk;
  const message = o.emailOk && o.smsOk
    ? "We sent your code by email and SMS."
    : o.emailOk
      ? (o.smsAttempted
        ? "We sent your code by email. SMS delivery was unavailable."
        : "We sent your code by email.")
      : o.smsOk
        ? "Email delivery was unavailable, but we sent your code by SMS."
        : "We could not send your verification code. Please check your email address and mobile number, then try again.";
  return {
    keepNewCode: delivered,
    deleteNewCode: !delivered,
    deletePriorCodes: delivered,
    ok: delivered,
    httpStatus: delivered ? 200 : 502,
    message,
    channels: { email: o.emailOk, sms: o.smsOk },
  };
}
