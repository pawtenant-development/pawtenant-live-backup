// logEmailComm — single helper used by every "send email" edge function so that
// every outbound email shows up in the unified Comms timeline (`communications` table).
// Fire-and-forget: any failure is swallowed and logged to console only — never blocks the send.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface LogEmailParams {
  supabase: ReturnType<typeof createClient>;
  orderId?: string | null;
  confirmationId?: string | null;
  to: string;
  from?: string | null;
  subject: string;
  body?: string | null;
  slug?: string | null;
  templateSource?: "db" | "hardcoded" | string | null;
  sentBy?: string | null;
  success?: boolean;
  type?: string;
}

export async function logEmailComm(p: LogEmailParams): Promise<void> {
  try {
    let resolvedOrderId = p.orderId ?? null;
    if (!resolvedOrderId && p.confirmationId) {
      const { data } = await p.supabase
        .from("orders")
        .select("id")
        .eq("confirmation_id", p.confirmationId)
        .maybeSingle();
      resolvedOrderId = (data as { id?: string } | null)?.id ?? null;
    }

    await p.supabase.from("communications").insert({
      order_id: resolvedOrderId,
      confirmation_id: p.confirmationId ?? null,
      type: p.type ?? "email",
      direction: "outbound",
      body: p.body ?? null,
      email_to: p.to,
      email_from: p.from ?? null,
      subject: p.subject,
      slug: p.slug ?? null,
      template_source: p.templateSource ?? null,
      status: p.success === false ? "failed" : "sent",
      sent_by: p.sentBy ?? "system",
    });
  } catch (err) {
    console.error("[logEmailComm] insert failed", err);
  }
}
