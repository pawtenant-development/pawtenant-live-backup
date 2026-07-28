/**
 * ADDITIONAL-PET-ADMIN-MORE-MENU-AND-COMPLETED-ORDER-GATING-002
 *
 * The Admin "Add Additional Pet" More-menu action.
 *
 * WHY THIS IS A SEPARATE COMPONENT: OrderDetailModal.tsx is MERGE-FROZEN. It
 * receives only a one-line mount; every behaviour lives here.
 *
 * CONTRACT:
 *   • Eligibility comes from the SAME server engine the Customer Portal uses
 *     (create-additional-pet-request -> resolve_additional_pet_pricing). Admin
 *     and Customer can therefore never disagree, and the browser never derives
 *     a price or an eligibility verdict.
 *   • The menu item is NEVER enabled before the server has ruled.
 *   • Clicking any menu item mutates NOTHING — it opens a dialog.
 *   • A completed / clinically locked order renders a DISABLED item and calls
 *     no payment, resolution or mutation endpoint.
 *
 * OWNER CORRECTION (2026-07-28): manual_review must NOT render as the same dead
 * "contact PawTenant Support" row it renders for the customer. Admin IS
 * PawTenant Support. A genuine manual review now gets an ENABLED
 * "Review Additional Pet Eligibility" action that shows the evidence and lets
 * Admin resolve the order to $20 / $0 / Blocked through a server-validated,
 * audited RPC. That RPC refuses outright on a completed or document-locked
 * order, so the completion lock can never be overridden from here.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

type Outcome = "paid_upgrade" | "included" | "manual_review" | "blocked" | "resume_payment";
type Resolution = "paid_upgrade" | "included" | "blocked";

interface Pricing {
  outcome: Outcome;
  code?: string;
  amount_cents?: number;
  currency?: string;
  current_pet_count?: number;
  target_pet_count?: number;
  max_total?: number;
  message?: string;
  lock_reason?: string;
  manual_review_code?: string;
  manual_review_reason?: string;
  resolved_by_admin?: boolean;
  // Pricing change 2026-07-28 ($20 -> $30). For an EXISTING request the server
  // returns THAT request's quoted amount, never today's price, so a checkout
  // created before the change stays payable at what the customer was quoted.
  pricing_version?: string | null;
  grandfathered?: boolean;
  current_price_cents?: number;
  active_request_id?: string;
  active_status?: string;
  active_outcome?: string;
  awaiting_payment?: boolean;
}

/** Payload from get_additional_pet_eligibility_review (admin-only RPC). */
interface ReviewPayload {
  found: boolean;
  order?: Record<string, unknown>;
  lock?: { locked?: boolean; reason?: string | null; signals?: string[] };
  pricing?: Pricing;
  state?: { effective_pet_count?: number; original_pet_count?: number; effective_tier?: string; max_total?: number };
  entitlement?: Record<string, unknown> | null;
  requests?: Array<Record<string, unknown>>;
  override?: { resolution?: string; note?: string; resolved_at?: string; resolved_by_email?: string } | null;
  override_history?: Array<Record<string, unknown>>;
  max_total?: number;
  /** Today's paid price + version. An Admin "Eligible" resolution quotes THIS. */
  current_price?: { pricing_version?: string; amount_cents?: number; currency?: string };
}

interface Pet { name: string; type: string; breed?: string; age?: string; weight?: string }

const EMPTY_PET: Pet = { name: "", type: "", breed: "", age: "", weight: "" };

/** Human wording for each machine-readable manual-review code. */
const REVIEW_CODE_LABEL: Record<string, string> = {
  entitlement_snapshot_missing: "No purchased-entitlement snapshot exists for this order.",
  legacy_package_unknown: "The purchased package could not be reconstructed deterministically.",
  conflicting_pet_count: "The recorded pet count contradicts the derived package limit.",
  service_not_resolvable: "The service type on this order is not ESA or PSD.",
  tier_not_provable: "The purchased pet tier could not be proven.",
  unresolved_existing_request: "An earlier Additional Pet request is unresolved.",
};

const dollars = (c?: number) => `$${((c ?? 0) / 100).toFixed(2)}`;

/**
 * Dialog host for a component mounted INSIDE the header "More" dropdown.
 *
 * WHY THIS EXISTS: OrderDetailModal renders the dropdown as
 * `{showHeaderMore && (<div role="menu"> … </div>)}` and closes it on any
 * document `mousedown` outside `headerMoreRef`, and on Escape. Two consequences
 * this component must survive:
 *
 *   1. Calling onCloseMenu() to open a dialog UNMOUNTS this component along
 *      with the dropdown, so the dialog never appears at all. (This is why the
 *      Admin "Add Additional Pet" item opened nothing.)
 *   2. A dialog portaled to document.body is NOT inside headerMoreRef, so the
 *      first mousedown in it would read as an outside click and close the menu
 *      — unmounting the dialog mid-interaction.
 *
 * So: portal to document.body for correct stacking (the dropdown sits in a
 * z-30 stacking context inside the modal), and stop mousedown/keydown from
 * reaching the document listeners that would tear the dropdown down. The menu
 * is closed deliberately when the dialog closes instead.
 */
function DialogHost({
  onRequestClose, labelledBy, children, blockClose,
}: {
  onRequestClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
  blockClose?: boolean;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      // z MUST exceed the OrderDetailModal root, which is `fixed inset-0
      // z-[100]`. At the inherited z-[80] the dialog mounted, laid out and
      // reported itself visible, but painted BEHIND the order modal — nothing
      // appeared on screen. Verified with elementFromPoint at the dialog's
      // centre returning the modal's content, not the dialog.
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-3 sm:p-4"
      onMouseDown={(e) => {
        e.stopPropagation();                       // keep the dropdown mounted
        if (e.target === e.currentTarget && !blockClose) onRequestClose();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();                       // keep the dropdown mounted
        if (e.key === "Escape" && !blockClose) onRequestClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-100 py-1.5 last:border-b-0">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <span className="min-w-0 break-words text-right text-xs font-medium text-gray-800">{value ?? "—"}</span>
    </div>
  );
}

export default function OrderAdditionalPetMenuAction({
  orderId,
  confirmationId,
  onCloseMenu,
}: {
  orderId: string;
  confirmationId?: string | null;
  onCloseMenu: () => void;
}) {
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [allowedTypes, setAllowedTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [pet, setPet] = useState<Pet>(EMPTY_PET);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Manual-review resolution dialog
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewError, setReviewError] = useState("");

  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  // Guards a second submit while the first is still in flight (double-click,
  // Enter-key repeat). A ref, not state, so it is effective synchronously.
  const inFlight = useRef(false);

  const callFn = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Your session has expired — please sign in again.");
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-additional-pet-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, orderId, siteUrl: window.location.origin, ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      const err = new Error(data?.error ?? `Request failed (HTTP ${res.status})`);
      (err as Error & { code?: string }).code = data?.code;
      throw err;
    }
    return data;
  }, [orderId]);

  const loadQuote = useCallback(async () => {
    const d = await callFn("quote");
    setPricing((d.pricing ?? null) as Pricing | null);
    setAllowedTypes((d.allowedPetTypes ?? []) as string[]);
  }, [callFn]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await callFn("quote");
        if (!alive) return;
        setPricing((d.pricing ?? null) as Pricing | null);
        setAllowedTypes((d.allowedPetTypes ?? []) as string[]);
      } catch {
        if (alive) setPricing(null);   // fail closed — the item stays disabled
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [callFn]);

  // Focus the first field when the add-pet dialog opens. Escape and
  // backdrop dismissal are owned by DialogHost, which must also stop those
  // events reaching the document listeners that would unmount the dropdown —
  // so this component deliberately registers NO document-level key handler.
  useEffect(() => {
    if (!open) return;
    firstFieldRef.current?.focus();
  }, [open]);

  const outcome = pricing?.outcome;
  const locked = outcome === "blocked" && pricing?.code === "order_completed";
  const actionable = outcome === "paid_upgrade" || outcome === "included";
  const needsReview = outcome === "manual_review";
  // An in-flight request. Payment resumes at ITS quoted price, not today's.
  const resumable = outcome === "resume_payment";

  const resume = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError("");
    try {
      const d = await callFn("resume");
      if (d.alreadyPaid) {
        setSuccess("That payment has already completed — the request is with the provider.");
      } else if (d.checkoutUrl) {
        try { await navigator.clipboard.writeText(d.checkoutUrl as string); } catch { /* optional */ }
        window.open(d.checkoutUrl as string, "_blank", "noopener");
        setSuccess("Existing payment link opened and copied. The amount is unchanged from the original quote.");
      }
      onCloseMenu();
      await loadQuote();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resume that payment.");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }, [callFn, loadQuote, onCloseMenu]);

  const submit = useCallback(async () => {
    if (inFlight.current) return;
    if (!pet.name.trim() || !pet.type.trim()) {
      setError("Pet name and type of animal are required.");
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setError("");
    try {
      const d = await callFn("create", { pet });
      // A $20 upgrade returns a Stripe Checkout URL; a $0 (included) request is
      // created straight away and goes to provider review. The server decides —
      // this component never picks a price or a path.
      if (d.checkoutUrl) {
        try { await navigator.clipboard.writeText(d.checkoutUrl as string); } catch { /* clipboard optional */ }
        window.open(d.checkoutUrl as string, "_blank", "noopener");
        setSuccess("Payment link opened in a new tab and copied to your clipboard. The pet is added once the customer pays and the provider approves.");
      } else {
        setSuccess("Added and sent for provider review at no extra charge.");
      }
      setOpen(false);
      setPet(EMPTY_PET);
      await loadQuote();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }, [callFn, pet, loadQuote]);

  // ── Manual-review evidence + resolution ───────────────────────────────────
  // NOTE: the menu is deliberately NOT closed here — doing so unmounts this
  // component (see DialogHost). It is closed when the dialog closes.
  const openReview = useCallback(async () => {
    setReviewError("");
    setReviewNote("");
    setReviewOpen(true);
    setReviewLoading(true);
    try {
      const { data, error: rErr } = await supabase
        .rpc("get_additional_pet_eligibility_review", { p_order_id: orderId });
      if (rErr) throw new Error(rErr.message);
      setReview(data as ReviewPayload);
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : "Could not load the review details.");
    } finally {
      setReviewLoading(false);
    }
  }, [orderId]);

  const closeReview = useCallback(() => { setReviewOpen(false); onCloseMenu(); }, [onCloseMenu]);
  const closeAdd = useCallback(() => { setOpen(false); onCloseMenu(); }, [onCloseMenu]);

  const resolve = useCallback(async (resolution: Resolution) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setReviewError("");
    try {
      // Server-validated and audited. It refuses on a completed / locked order,
      // and the $20 amount is computed server-side — never sent from here.
      const { data, error: rErr } = await supabase
        .rpc("admin_resolve_additional_pet_eligibility", {
          p_order_id: orderId, p_resolution: resolution, p_note: reviewNote.trim() || null,
        });
      if (rErr) throw new Error(rErr.message);
      const next = (data as { pricing?: Pricing } | null)?.pricing ?? null;
      if (next) setPricing(next);
      setReviewOpen(false);
      setSuccess(
        resolution === "blocked"
          ? "Marked as not eligible. The customer now sees this order as unavailable for an additional pet."
          : `Resolved as ${resolution === "paid_upgrade"
              ? `${dollars(next?.amount_cents)} upgrade`
              : "included ($0.00)"}. The customer portal is updated.`,
      );
      await loadQuote();
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : "Could not resolve this order.");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }, [orderId, reviewNote, loadQuote]);

  // ── Menu item ─────────────────────────────────────────────────────────────
  const baseCls = "w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold transition-colors border-b border-gray-100 text-left";

  if (loading) {
    return (
      <button type="button" role="menuitem" disabled aria-disabled="true"
        title="Checking Additional Pet eligibility"
        className={`${baseCls} text-gray-400 cursor-not-allowed`}>
        <i className="ri-loader-4-line animate-spin" aria-hidden="true"></i>
        <span className="flex-1">Checking eligibility...</span>
      </button>
    );
  }

  if (!pricing) return null;   // fail closed: never render an actionable item

  // ── COMPLETED / CLINICALLY LOCKED — unchanged, and never resolvable ───────
  if (locked) {
    return (
      <div
        role="menuitem"
        aria-disabled="true"
        title="Additional pets cannot be added after the evaluation is completed. The customer must start a new evaluation with all pets included."
        className={`${baseCls} text-gray-400 cursor-not-allowed items-start`}
      >
        <i className="ri-lock-line mt-0.5" aria-hidden="true"></i>
        <span className="flex-1">
          Add Additional Pet
          <span className="mt-0.5 block font-normal leading-snug text-gray-400">
            Unavailable — the evaluation is completed. The customer must start a new
            evaluation with all pets included.
          </span>
        </span>
      </div>
    );
  }

  // ── GENUINE MANUAL REVIEW — actionable for Admin ──────────────────────────
  if (needsReview) {
    const code = pricing.manual_review_code ?? pricing.code ?? "";
    return (
      <>
        <button
          type="button"
          role="menuitem"
          onClick={openReview}
          title="Review why automatic Additional Pet classification failed and resolve this order"
          className={`${baseCls} items-start text-[#B45309] hover:bg-amber-50 cursor-pointer`}
        >
          <i className="ri-search-eye-line mt-0.5" aria-hidden="true"></i>
          <span className="flex-1">
            Review Additional Pet Eligibility
            <span className="mt-0.5 block font-normal leading-snug text-gray-500">
              {REVIEW_CODE_LABEL[code] ?? pricing.manual_review_reason ?? "Automatic classification could not resolve this order."}
            </span>
          </span>
        </button>

        {success && (
          <div role="status" className="border-b border-gray-100 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">
            {success}
          </div>
        )}

        {reviewOpen && (
          <DialogHost onRequestClose={closeReview} labelledBy="admin-addpet-review-title" blockClose={submitting}>
            <ReviewDialog
              confirmationId={confirmationId}
              review={review}
              loading={reviewLoading}
              error={reviewError}
              note={reviewNote}
              setNote={setReviewNote}
              submitting={submitting}
              onClose={closeReview}
              onResolve={resolve}
              codeLabel={REVIEW_CODE_LABEL[code] ?? pricing.manual_review_reason ?? null}
              code={code}
            />
          </DialogHost>
        )}
      </>
    );
  }

  // ── IN-FLIGHT REQUEST — resume at the price it was quoted at ─────────────
  // Pricing change 2026-07-28. A request created under the $20 rule keeps that
  // amount; the label reads the SERVER's stored amount, so Admin can never
  // regenerate a grandfathered checkout at today's higher price by accident.
  if (resumable) {
    const isGrandfathered = pricing.grandfathered === true;
    const payable = pricing.awaiting_payment === true;
    const amt = dollars(pricing.amount_cents);
    return (
      <>
        <button
          type="button"
          role="menuitem"
          onClick={payable ? resume : () => { onCloseMenu(); }}
          disabled={submitting}
          title={payable
            ? `Resume the existing Additional Pet checkout for ${amt}`
            : "An Additional Pet request is already with the provider"}
          className={`${baseCls} items-start ${payable
            ? "text-[#1a5c4f] hover:bg-emerald-50 cursor-pointer"
            : "text-gray-400 cursor-not-allowed"}`}
        >
          <i className={`${payable ? "ri-refresh-line" : "ri-time-line"} mt-0.5`} aria-hidden="true"></i>
          <span className="flex-1">
            {payable
              ? <>Resume Additional Pet Checkout <span className="font-normal text-gray-400">({amt})</span></>
              : <>Additional Pet in progress</>}
            <span className="mt-0.5 block font-normal leading-snug text-gray-500">
              {payable
                ? (isGrandfathered
                    ? `Existing checkout at the previous ${amt} price — it stays valid at that amount (current price ${dollars(pricing.current_price_cents)}).`
                    : "Awaiting the customer's payment. Resuming re-uses the same request.")
                : `Status: ${pricing.active_status ?? "in progress"}. No second request can be created.`}
            </span>
          </span>
        </button>
        {success && (
          <div role="status" className="border-b border-gray-100 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">
            {success}
          </div>
        )}
        {error && (
          <div role="alert" className="border-b border-gray-100 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700">
            {error}
          </div>
        )}
      </>
    );
  }

  // ── BLOCKED for an explicit, non-completion reason ────────────────────────
  if (!actionable) {
    const detail = pricing.code === "max_pets_reached"
      ? `This order already covers the maximum of ${pricing.max_total ?? 3} pets.`
      : pricing.message ?? "Additional Pet is not available for this order.";
    return (
      <div role="menuitem" aria-disabled="true" title={detail}
        className={`${baseCls} text-gray-400 cursor-not-allowed items-start`}>
        <i className="ri-information-line mt-0.5" aria-hidden="true"></i>
        <span className="flex-1">
          Add Additional Pet
          <span className="mt-0.5 block font-normal leading-snug text-gray-400">
            Not available — {detail}
          </span>
        </span>
      </div>
    );
  }

  // ── ELIGIBLE: $20 upgrade or $0 included ──────────────────────────────────
  const isPaid = outcome === "paid_upgrade";
  // The amount is rendered EXACTLY as the server returned it. No client-side
  // default: a missing amount must never be papered over with a guessed price.
  const priceLabel = isPaid ? dollars(pricing.amount_cents) : "Included";

  return (
    <>
      <button
        type="button"
        role="menuitem"
        // The menu is deliberately NOT closed here — see DialogHost.
        onClick={() => { setError(""); setSuccess(""); setPet(EMPTY_PET); setOpen(true); }}
        title={isPaid
          ? `Add another pet — a one-time ${priceLabel} package-tier upgrade`
          : "Add another pet — already covered by this package"}
        className={`${baseCls} text-[#1a5c4f] hover:bg-emerald-50 cursor-pointer`}
      >
        <i className="ri-add-circle-line" aria-hidden="true"></i>
        <span className="flex-1">
          {isPaid
            ? <>Add Additional Pet <span className="font-normal text-gray-400">({priceLabel})</span></>
            : <>Add Additional Pet <span className="font-normal text-gray-400">— Included</span></>}
          {pricing.resolved_by_admin && (
            <span className="mt-0.5 block font-normal leading-snug text-gray-400">
              Resolved by admin review
            </span>
          )}
        </span>
      </button>

      {success && (
        <div role="status" className="border-b border-gray-100 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">
          {success}
        </div>
      )}

      {open && (
        <DialogHost onRequestClose={closeAdd} labelledBy="admin-addpet-title" blockClose={submitting}>
            <div className="border-b border-gray-100 px-5 py-4">
              <h3 id="admin-addpet-title" className="text-sm font-extrabold text-gray-900">Add Additional Pet</h3>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">
                {confirmationId ? <span className="font-semibold text-gray-700">{confirmationId}</span> : null}
                {confirmationId ? " · " : null}
                {isPaid
                  ? `A one-time ${priceLabel} package-tier upgrade lets this order cover up to 3 pets. It is not a charge per pet. The pet is added only after the customer pays.`
                  : "This package already covers the pet — no additional payment is required."}
                {" "}Provider review is still required before an updated document is issued.
              </p>
            </div>

            <div className="space-y-3 px-5 py-4">
              <div>
                <label htmlFor="admin-addpet-name" className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Pet name</label>
                <input
                  id="admin-addpet-name" ref={firstFieldRef} type="text" value={pet.name}
                  onChange={(e) => setPet((p) => ({ ...p, name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#3b6ea5] focus:outline-none focus:ring-1 focus:ring-[#3b6ea5]"
                />
              </div>
              <div>
                <label htmlFor="admin-addpet-type" className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Type of animal</label>
                <select
                  id="admin-addpet-type" value={pet.type}
                  onChange={(e) => setPet((p) => ({ ...p, type: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#3b6ea5] focus:outline-none focus:ring-1 focus:ring-[#3b6ea5]"
                >
                  <option value="">Select...</option>
                  {(allowedTypes.length ? allowedTypes : ["Dog", "Cat"]).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="admin-addpet-breed" className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Breed</label>
                  <input id="admin-addpet-breed" type="text" value={pet.breed}
                    onChange={(e) => setPet((p) => ({ ...p, breed: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#3b6ea5] focus:outline-none focus:ring-1 focus:ring-[#3b6ea5]" />
                </div>
                <div>
                  <label htmlFor="admin-addpet-age" className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Age</label>
                  <input id="admin-addpet-age" type="text" value={pet.age}
                    onChange={(e) => setPet((p) => ({ ...p, age: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#3b6ea5] focus:outline-none focus:ring-1 focus:ring-[#3b6ea5]" />
                </div>
                <div>
                  <label htmlFor="admin-addpet-weight" className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Weight</label>
                  <input id="admin-addpet-weight" type="text" value={pet.weight}
                    onChange={(e) => setPet((p) => ({ ...p, weight: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#3b6ea5] focus:outline-none focus:ring-1 focus:ring-[#3b6ea5]" />
                </div>
              </div>

              {error && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                  {error}
                </p>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button type="button" onClick={closeAdd} disabled={submitting}
                className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={submit} disabled={submitting}
                className="rounded-lg bg-[#1a5c4f] px-4 py-2 text-xs font-bold text-white hover:bg-[#14483e] focus:outline-none focus:ring-2 focus:ring-[#1a5c4f] focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60">
                {submitting
                  ? "Working..."
                  : isPaid ? `Create payment link (${priceLabel})` : "Add this pet"}
              </button>
            </div>
        </DialogHost>
      )}
    </>
  );
}

/* ── Manual-review evidence + resolution dialog ─────────────────────────────
   Shows WHY automatic classification failed and every fact the owner requires
   before a human decides. The three resolutions post to a SECURITY DEFINER RPC
   that re-checks the completion lock server-side. */
function ReviewDialog({
  confirmationId, review, loading, error, note, setNote, submitting,
  onClose, onResolve, codeLabel, code,
}: {
  confirmationId?: string | null;
  review: ReviewPayload | null;
  loading: boolean;
  error: string;
  note: string;
  setNote: (v: string) => void;
  submitting: boolean;
  onClose: () => void;
  onResolve: (r: Resolution) => void;
  codeLabel: string | null;
  code: string;
}) {
  const order = (review?.order ?? {}) as Record<string, unknown>;
  const ent = review?.entitlement as Record<string, unknown> | null | undefined;
  // Resolving "Eligible" quotes TODAY's price, from the server — never a
  // literal, so this label cannot drift from what the customer is charged.
  const currentPriceLabel = dollars(review?.current_price?.amount_cents);
  const state = review?.state;
  const lock = review?.lock;
  const reqs = review?.requests ?? [];
  const str = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

  // The overlay, role="dialog" wrapper and dismissal are provided by DialogHost.
  return (
    <>
        <div className="border-b border-gray-100 px-5 py-4">
          <h3 id="admin-addpet-review-title" className="text-sm font-extrabold text-gray-900">
            Review Additional Pet Eligibility
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            {confirmationId ? <span className="font-semibold text-gray-700">{confirmationId}</span> : null}
            {confirmationId ? " · " : null}
            Automatic classification could not resolve this order. Confirm the entitlement
            below, then record the outcome. The upgrade amount stays server-computed and the
            customer still pays before the pet is added.
          </p>
        </div>

        {loading ? (
          <p className="px-5 py-6 text-xs font-semibold text-gray-500">Loading order evidence…</p>
        ) : (
          <div className="space-y-4 px-5 py-4">
            {/* Why it failed */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">
                Why automatic classification failed
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-900">{codeLabel ?? "Unknown reason."}</p>
              <p className="mt-1.5 font-mono text-[11px] text-amber-700">{code || "—"}</p>
            </div>

            <div className="rounded-lg border border-gray-200 px-3.5 py-2">
              <Row label="Package" value={str(order.package_key ?? "(none recorded)")} />
              <Row label="Plan" value={`${str(order.billing_plan ?? order.plan_type)} · ${str(order.letter_type).toUpperCase()}`} />
              <Row label="Price paid" value={`$${str(order.price)}${order.coupon_discount ? ` (coupon $${str(order.coupon_discount)})` : ""}`} />
              <Row label="Payment state" value={str(order.payment_state)} />
              {/* `refunded_at` is set for a PARTIAL refund too, so it must never
                  be read as a boolean "is refunded" — a partially refunded order
                  stays active and stays eligible for an additional pet. Report
                  refund_status, which is the field that actually distinguishes
                  them, and call partial out explicitly. */}
              <Row
                label="Refund state"
                value={(() => {
                  const rs = String(order.refund_status ?? "none");
                  const when = String(order.refunded_at ?? "").slice(0, 10);
                  if (rs === "partial") return `partial${when ? ` (${when})` : ""} — order still active`;
                  if (rs === "none" || rs === "") return "none";
                  return `${rs}${when ? ` · ${when}` : ""}`;
                })()}
              />
              <Row label="Additional documentation" value={order.includes_ra ? "Yes (RA included)" : "No"} />
              <Row label="Order / provider status" value={`${str(order.status)} · ${str(order.doctor_status)}`} />
            </div>

            <div className="rounded-lg border border-gray-200 px-3.5 py-2">
              <Row label="Existing pets" value={`${str(state?.effective_pet_count)} of ${str(review?.max_total ?? 3)}`} />
              <Row label="Purchased entitlement" value={ent ? `${str(ent.purchased_pet_tier)} · limit ${str(ent.purchased_pet_limit ?? "not provable")}` : "No snapshot recorded"} />
              <Row label="Entitlement evidence" value={ent ? `${str(ent.evidence_confidence)} (${str(ent.pricing_version)})` : "—"} />
              <Row label="Existing Additional Pet requests" value={reqs.length ? `${reqs.length}` : "None"} />
              <Row
                label="Completion / lock state"
                value={lock?.locked
                  ? <span className="text-red-700">Locked — {str(lock.reason)}</span>
                  : <span className="text-emerald-700">Open — not completed</span>}
              />
            </div>

            {lock?.locked && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                This evaluation is completed or a document has been issued. Eligibility cannot
                be resolved — the customer must start a new evaluation.
              </p>
            )}

            <div>
              <label htmlFor="admin-addpet-review-note" className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">
                Resolution note (recorded in the audit log)
              </label>
              <textarea
                id="admin-addpet-review-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Confirmed single-pet purchase against the Stripe receipt."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#3b6ea5] focus:outline-none focus:ring-1 focus:ring-[#3b6ea5]"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {error}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button type="button" onClick={onClose} disabled={submitting}
            className="mr-auto rounded-lg border border-gray-200 px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={() => onResolve("blocked")} disabled={submitting || loading || !!lock?.locked}
            className="rounded-lg border border-gray-300 px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
            Blocked
          </button>
          <button type="button" onClick={() => onResolve("included")} disabled={submitting || loading || !!lock?.locked}
            className="rounded-lg border border-[#1a5c4f] px-3.5 py-2 text-xs font-bold text-[#1a5c4f] hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50">
            Included — $0.00
          </button>
          <button type="button" onClick={() => onResolve("paid_upgrade")} disabled={submitting || loading || !!lock?.locked}
            className="rounded-lg bg-[#1a5c4f] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#14483e] focus:outline-none focus:ring-2 focus:ring-[#1a5c4f] focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60">
            {submitting ? "Working..." : `Eligible — ${currentPriceLabel}`}
          </button>
        </div>
    </>
  );
}
