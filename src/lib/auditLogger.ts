import { supabase } from "./supabaseClient";

export interface AuditEventParams {
  actor_id?: string | null;
  actor_name: string;
  actor_role?: string | null;
  object_type: "order" | "payment" | "refund" | "doctor" | "staff" | "ghl_sync" | "customer" | "letter" | "system";
  object_id?: string | null;
  action: string;
  description?: string | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Log an audit event. Silent-fails so it never breaks UI.
 */
export async function logAudit(params: AuditEventParams): Promise<void> {
  try {
    await supabase.from("audit_logs").insert(params);
  } catch {
    // Never break UI for logging failures
  }
}
