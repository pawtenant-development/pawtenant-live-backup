// _shared/roleMailboxes.ts — canonical PawTenant role mailbox map.
//
// Task: MICROSOFT-365-PRECUTOVER-BACKEND-ROLE-MAILBOX-REMEDIATION-001
//
// These five mailboxes are owner-confirmed Microsoft 365 shared mailboxes.
// During Google/Microsoft coexistence they still receive via the Google MX;
// after the MX cutover they receive via Microsoft. Nothing in this file
// depends on which MX is live — these are addresses, not transport.
//
// Sending stays on Resend. This file must never carry API keys, SMTP
// credentials, or anything secret; it is plain routing configuration.
//
// Business mapping (owner-defined):
//
//   ACCOUNTS  financial operations — Stripe money events, payments, payment
//             failures, refunds, disputes, chargebacks, payouts, accounting
//             and financial reconciliation failures.
//
//   HELLO     customer support, provider support, lead operations, general
//             operational replies. This is the default Reply-To for any
//             message where a human response is expected.
//
//   SUPPORT   visible sender for review-request / support-branded email.
//             Sends via Resend; replies are steered to HELLO so they land in
//             the monitored support queue rather than a second inbox.
//
//   INFO      technical and system alerts — application failures,
//             configuration alerts, integration failures, delivery-health
//             alerts, and other NON-financial admin system notifications.
//
//   SOCIALS   social-media notifications only. Deliberately unused by the
//             application; do not route operational mail here.
//
// Rule of thumb when classifying a new alert: if a human would act on it by
// reconciling money, it is ACCOUNTS. If a human would act on it by fixing
// configuration or code, it is INFO.

export const ROLE_MAILBOX = {
  ACCOUNTS: "accounts@pawtenant.com",
  HELLO: "hello@pawtenant.com",
  SUPPORT: "support@pawtenant.com",
  INFO: "info@pawtenant.com",
  SOCIALS: "socials@pawtenant.com",
} as const;

export type RoleMailbox = typeof ROLE_MAILBOX[keyof typeof ROLE_MAILBOX];

/** Display name used on every PawTenant From header. */
export const COMPANY_NAME = "PawTenant";

/**
 * Visible sender for support-branded email (currently: review requests).
 * Preserved as an active Resend sender — do not silently fold this into HELLO.
 */
export const SUPPORT_FROM = `${COMPANY_NAME} Support <${ROLE_MAILBOX.SUPPORT}>`;

/**
 * Default Reply-To for any customer- or provider-facing message.
 * Every human reply should converge on the monitored support queue.
 */
export const OPERATIONAL_REPLY_TO = ROLE_MAILBOX.HELLO;

/**
 * Visible sender for internal system-health alerts. Uses the already-verified
 * hello@ sending identity so no new Resend sender has to be introduced.
 * These are machine-to-operator messages: they carry NO Reply-To, because
 * there is no human on the other end to reply to.
 */
export const SYSTEM_FROM = `${COMPANY_NAME} System <${ROLE_MAILBOX.HELLO}>`;

/**
 * The ONLY destination a system-health alert may reach.
 *
 * SYSTEM-HEALTH-TECHNICAL-ALERT-DELIVERY-REPAIR-001: this is derived
 * server-side and must never be taken from a caller. The alert endpoint is
 * reachable by the anonymous browser (the failures it reports happen during
 * public checkout, before any admin session exists), so a caller-supplied
 * recipient would turn it into an open relay.
 */
export const SYSTEM_ALERT_RECIPIENT = ROLE_MAILBOX.INFO;
