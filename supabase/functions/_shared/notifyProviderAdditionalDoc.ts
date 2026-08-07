// notifyProviderAdditionalDoc — ADDITIONAL-DOCUMENTATION-PROVIDER-NOTIFICATION-001
//
// Thin, best-effort fire of the `notify-provider-additional-doc` edge function.
//
// Every call site is a TRIGGER, not a decision: this helper deliberately passes
// only the order reference. The notifier re-derives actionability, the request
// type and the currently assigned provider from the database, and enforces
// exactly-once via communications.dedupe_key. That means a call site can fire
// optimistically — on every upload, on every assignment — without having to know
// whether a notification is due, and without any risk of double-sending.
//
// NEVER let this throw into the caller: the customer's upload and the admin's
// assignment must both succeed even when provider mail is down.

export async function notifyProviderAdditionalDoc(opts: {
  supabaseUrl: string;
  /** The caller's ALREADY-RESOLVED service-role key. Passed in rather than read
   *  from env here because the two repos declare it under different names. */
  serviceKey: string;
  confirmationId: string | null;
  trigger: "customer_upload" | "assignment";
}): Promise<void> {
  if (!opts.confirmationId || !opts.supabaseUrl || !opts.serviceKey) return;
  try {
    const res = await fetch(`${opts.supabaseUrl}/functions/v1/notify-provider-additional-doc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.serviceKey}`,
        apikey: opts.serviceKey,
      },
      body: JSON.stringify({ confirmationId: opts.confirmationId, trigger: opts.trigger }),
    });
    const text = await res.text().catch(() => "");
    console.log(`[notifyProviderAdditionalDoc] ${opts.trigger} ${opts.confirmationId} → ${res.status} ${text.slice(0, 200)}`);
  } catch (e) {
    console.warn(
      "[notifyProviderAdditionalDoc] trigger failed (non-fatal):",
      e instanceof Error ? e.message : String(e),
    );
  }
}
