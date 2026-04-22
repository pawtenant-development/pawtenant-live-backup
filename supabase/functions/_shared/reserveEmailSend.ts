// reserveEmailSend — shared entry point for new callers that need two-phase,
// DB-deduped email sends. Thin re-export of the canonical implementation in
// ../_shared/logEmailComm.ts so we avoid two sources of truth. Existing call
// sites (e.g. lead-followup-sequence) continue importing from logEmailComm.ts
// directly; this file is only for NEW callers (send-renewal-reminders, etc.).

export {
  reserveEmailSend,
  finalizeEmailSend,
  buildDedupeKey,
} from "./logEmailComm.ts";

export type {
  ReserveEmailParams,
  ReserveResult,
  FinalizeEmailParams,
  DedupeKeyParts,
} from "./logEmailComm.ts";
