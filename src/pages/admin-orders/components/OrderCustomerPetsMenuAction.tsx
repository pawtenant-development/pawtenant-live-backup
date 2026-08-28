// OrderCustomerPetsMenuAction — ADMIN-ORDER-CUSTOMER-PET-EDITING-LIVE-001
//
// Isolated component mount for the frozen OrderDetailModal header "More" menu
// (CLAUDE.md merge-freeze: "isolated component mount" is an approved edit type;
// the frozen file gets one mount, everything else lives here).
//
// WHAT THIS IS
//   Admin correction of the customer's first name, last name and state, and of
//   the order's pet rows — on ANY order, completed ones included.
//
// LIVE vs TEST — READ BEFORE PORTING ANYTHING
//   The TEST build imports MIN_PETS / MAX_PETS / PET_TYPE_OPTIONS from
//   src/pages/assessment/components/step1/PetSection.ts. That module is part of
//   the Step-1 assessment restructure, which is TEST-ONLY and was deliberately
//   never promoted. It MUST NOT be imported or copied here. Instead:
//
//     * animal types  → PET_TYPES, exported from LIVE's own Step2PersonalInfo,
//                       the same list the customer saw at intake.
//     * pet ceiling   → `max_total_pets` from the server read model, which is
//                       public.additional_pet_max_total(). The database is the
//                       single source; this file hard-codes no ceiling.
//     * pet floor     → 1, the one rule with no server-side constant.
//     * pet shape     → whatever orders.assessment_answers.pets[] already
//                       holds. Every row is round-tripped through `raw`, so a
//                       key this editor does not understand is preserved rather
//                       than silently dropped (the server enforces this too).
//
// WHERE THE AUTHORITY LIVES
//   Nowhere in this file. Admin identity, the 1–3 limit, the purchased
//   entitlement gate, paid-invoice evidence, single-use consumption, state
//   normalisation, provider-licence compatibility, the document-reissue
//   transition and the audit row are all enforced by
//   public.admin_update_order_customer_and_pets() inside ONE transaction on a
//   row-locked order. A disabled button is never the protection.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase, getAdminToken } from "../../../lib/supabaseClient";
import { US_STATES, normalizeStateToCode } from "../../../lib/usStates";
import { PET_TYPES } from "../../assessment/components/Step2PersonalInfo";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

/** The one rule with no server-side constant. The CEILING is never hard-coded
 *  here — it comes from the read model (additional_pet_max_total()). */
export const MIN_PETS_PER_ORDER = 1;

/** The exact copy the owner specified for the missing-payment gate. */
export const PAYMENT_REQUIRED_MESSAGE =
  "Additional payment required. Send a custom Additional Pet invoice and wait for payment before adding this pet.";

/** Mirrors the reason rules public.validate_reopen_reason() enforces. */
export function isCorrectionReasonValid(raw: string): boolean {
  const v = raw.trim();
  return v.length >= 5 && v.length <= 1000 && !/<[a-zA-Z/!]/.test(v);
}

/** LIVE's stored pet shape is {name, type, breed, age, weight}. `raw` keeps the
 *  ENTIRE original object so any additional key survives a round trip. */
export interface EditablePet {
  name: string;
  type: string;
  breed: string;
  age: string;
  weight: string;
  raw: Record<string, unknown>;
}

interface EditState {
  ok: boolean;
  order_id: string;
  confirmation_id: string | null;
  first_name: string | null;
  last_name: string | null;
  state: string | null;
  state_code: string | null;
  pets: Record<string, unknown>[];
  pet_count: number;
  approved_added_pets: number;
  effective_pet_count: number;
  max_total_pets: number;
  purchased_pet_limit: number | null;
  purchased_pet_tier: string | null;
  entitlement_confidence: string | null;
  entitlement_known: boolean;
  covered_pet_count: number;
  available_authorizations: {
    id: string; amount_cents: number; paid_at: string;
    stripe_invoice_id: string | null; customer_description: string | null;
  }[];
  assigned_provider: {
    user_id: string; full_name: string | null;
    licensed_states: string[] | null; licensed_in_current_state: boolean;
  } | null;
  workflow_state: string;
  documents: { issued_main_letters: number; latest_delivered_at: string | null } | null;
  has_issued_document: boolean;
  fingerprint: string;
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

function toEditable(raw: Record<string, unknown>): EditablePet {
  return {
    name: str(raw.name), type: str(raw.type), breed: str(raw.breed),
    age: str(raw.age), weight: str(raw.weight),
    raw: raw ?? {},
  };
}

function emptyPet(): EditablePet {
  return { name: "", type: "", breed: "", age: "", weight: "", raw: {} };
}

function DialogHost({ onRequestClose, children }: { onRequestClose: () => void; children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center bg-black/40 p-2 sm:p-4 overflow-y-auto"
      onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onRequestClose(); }}
      onKeyDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Edit customer and pets"
    >
      {children}
    </div>,
    document.body,
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="min-w-0">
      <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{label}</label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="text-[10px] text-gray-400 mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

const INPUT =
  "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:border-[#3b6ea5] focus:bg-white min-w-0";

/** Before → after. Renders nothing when the field is unchanged. */
function Delta({ label, before, after }: { label: string; before: string; after: string }) {
  if ((before || "—") === (after || "—")) return null;
  return (
    <div className="flex items-start gap-2 text-[11px] min-w-0">
      <span className="font-bold text-gray-500 uppercase tracking-wider shrink-0 w-20 sm:w-24">{label}</span>
      <span className="text-gray-500 line-through break-words min-w-0">{before || "—"}</span>
      <i className="ri-arrow-right-line text-gray-400 shrink-0"></i>
      <span className="font-bold text-[#1e3a5f] break-words min-w-0">{after || "—"}</span>
    </div>
  );
}

export default function OrderCustomerPetsMenuAction({
  orderId, confirmationId, onCloseMenu, onSaved,
}: {
  orderId: string;
  confirmationId: string | null;
  onCloseMenu: () => void;
  /** Lets the frozen parent push the committed values into the modal and the
   *  Orders list without a page reload. Called ONLY with a server snapshot. */
  onSaved?: (patch: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<EditState | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [pets, setPets] = useState<EditablePet[]>([]);
  const [reason, setReason] = useState("");

  const [confirmState, setConfirmState] = useState(false);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [confirmCompleted, setConfirmCompleted] = useState(false);
  const [confirmProvider, setConfirmProvider] = useState(false);
  const [confirmReissue, setConfirmReissue] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Invoice sub-flow (the EXISTING custom-invoice feature, prefilled).
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [invoiceMsg, setInvoiceMsg] = useState("");

  // Synchronous double-submit guard: `busy` updates asynchronously, so five
  // fast clicks can all observe busy === false.
  const busyRef = useRef(false);
  // One idempotency key per ATTEMPT, re-minted only after a committed save, so
  // a retry after a network blip replays instead of adding the pet twice.
  const idemRef = useRef<string>("");

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    const { data, error: e } = await supabase.rpc("admin_order_customer_pet_edit_state", { p_order_id: orderId });
    if (e) { setLoadError(e.message.replace(/^.*?:\s*/, "")); setLoading(false); return; }
    const s = data as unknown as EditState;
    setState(s);
    setFirst(s.first_name ?? "");
    setLast(s.last_name ?? "");
    setStateCode(s.state_code ?? "");
    setPets((s.pets ?? []).map(toEditable));
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    if (!open) return;
    idemRef.current = crypto.randomUUID();
    setError(""); setSuccess(""); setInvoiceMsg("");
    setConfirmState(false); setConfirmRemoval(false); setConfirmCompleted(false);
    setConfirmProvider(false); setConfirmReissue(false);
    void load();
  }, [open, load]);

  // The ceiling is the SERVER's value, never a constant in this file.
  const maxPets = state?.max_total_pets ?? MIN_PETS_PER_ORDER;

  const nameChanged = !!state && (first.trim() !== (state.first_name ?? "") || last.trim() !== (state.last_name ?? ""));
  const stateChanged = !!state && (stateCode || null) !== (state.state_code ?? state.state ?? null);
  const petsChanged = useMemo(() => {
    if (!state) return false;
    if (pets.length !== state.pets.length) return true;
    return pets.some((p, i) => {
      const o = toEditable((state.pets[i] ?? {}) as Record<string, unknown>);
      return p.name !== o.name || p.type !== o.type || p.breed !== o.breed
        || p.age !== o.age || p.weight !== o.weight;
    });
  }, [pets, state]);

  const removalCount = state ? Math.max(0, state.pets.length - pets.length) : 0;
  const isCompleted = state?.workflow_state === "completed";
  const effectiveCount = (state?.approved_added_pets ?? 0) + pets.length;
  const ceilingExceeded = !!state && effectiveCount > maxPets;

  // Growth beyond what the purchase covers. `covered_pet_count` never charges
  // to KEEP what is already on the order; only to add past it.
  const growth = state ? Math.max(0, pets.length - state.covered_pet_count) : 0;
  const availableAuths = state?.available_authorizations.length ?? 0;
  const paymentShortfall = Math.max(0, growth - availableAuths);
  const paymentBlocked = paymentShortfall > 0;

  const providerIneligible = !!state?.assigned_provider && stateChanged && !!stateCode
    && !(state.assigned_provider.licensed_states ?? [])
      .some((s) => normalizeStateToCode(s) === stateCode);
  const providerMissing = !!state && !state.assigned_provider;
  const reissueRequired = !!state?.has_issued_document && (nameChanged || stateChanged || petsChanged);

  const petsValid = pets.length >= MIN_PETS_PER_ORDER && pets.length <= maxPets
    && pets.every((p) => p.name.trim() && p.type.trim());
  const reasonValid = isCorrectionReasonValid(reason);
  const somethingChanged = nameChanged || stateChanged || petsChanged;

  const confirmationsSatisfied =
    (!stateChanged || confirmState)
    && (removalCount === 0 || confirmRemoval)
    && (!isCompleted || confirmCompleted)
    && (!providerIneligible || confirmProvider)
    && (!reissueRequired || confirmReissue);

  const canSave = !!state && !busy && somethingChanged && petsValid && reasonValid
    && !ceilingExceeded && !paymentBlocked && confirmationsSatisfied
    && !!first.trim() && !!last.trim();

  function patchPet(i: number, patch: Partial<EditablePet>) {
    setPets((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function addPet() {
    setPets((prev) => (prev.length >= maxPets ? prev : [...prev, emptyPet()]));
  }
  function removePet(i: number) {
    setPets((prev) => (prev.length <= MIN_PETS_PER_ORDER ? prev : prev.filter((_, idx) => idx !== i)));
  }

  async function sendAdditionalPetInvoice() {
    if (invoiceBusy) return;
    setInvoiceMsg("");
    const dollars = Number(invoiceAmount);
    if (!Number.isFinite(dollars) || dollars <= 0) { setInvoiceMsg("Enter an amount greater than zero."); return; }
    setInvoiceBusy(true);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-custom-payment-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          confirmationId,
          // The EXISTING custom-invoice purpose. `authorizes` is the narrow
          // label that lets this editor recognise WHAT the payment bought.
          purpose: "supplemental_charge",
          authorizes: "additional_pet",
          amountCents: Math.round(dollars * 100),
          customerDescription: `Additional Pet — order ${confirmationId ?? ""}`.trim(),
          internalNote: "Raised from Edit Customer & Pets (ADMIN-ORDER-CUSTOMER-PET-EDITING-001).",
          operationToken: crypto.randomUUID(),
        }),
      });
      const d = await res.json() as { ok?: boolean; error?: string; duplicate?: boolean };
      if (d.ok && d.duplicate) setInvoiceMsg("A request for this operation already exists.");
      else if (d.ok) { setInvoiceMsg("Additional Pet invoice created and sent. Re-check payment once the customer pays."); setInvoiceAmount(""); }
      else setInvoiceMsg(d.error ?? "Could not create the payment request.");
    } catch (e) {
      setInvoiceMsg(e instanceof Error ? e.message : "Network error");
    }
    setInvoiceBusy(false);
  }

  async function save() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(""); setSuccess("");
    try {
      const { data, error: e } = await supabase.rpc("admin_update_order_customer_and_pets", {
        p_order_id: orderId,
        p_first_name: first.trim(),
        p_last_name: last.trim(),
        p_state: stateCode || null,
        // Spread `raw` FIRST so any key this editor does not understand is
        // carried back untouched; the edited fields then overwrite it.
        p_pets: pets.map((p) => ({
          ...p.raw,
          name: p.name.trim(), type: p.type.trim(), breed: p.breed.trim(),
          age: p.age.trim(), weight: p.weight.trim(),
        })),
        p_reason: reason.trim(),
        p_expected_fingerprint: state?.fingerprint ?? null,
        p_idempotency_key: idemRef.current,
        p_confirm: {
          state: confirmState, pet_removal: confirmRemoval, completed_order: confirmCompleted,
          provider_reassignment: confirmProvider, document_reissue: confirmReissue,
        },
      });
      if (e) throw new Error(e.message.replace(/^.*?:\s*/, ""));
      const committed = data as unknown as {
        ok?: boolean; first_name?: string; last_name?: string; state?: string;
        new_pet_count?: number; doctor_user_id?: string | null;
        doctor_status?: string | null; document_reissue_required?: boolean;
        provider_reassignment_required?: boolean; replayed?: boolean;
      } | null;
      // Success is claimed ONLY on a committed server snapshot.
      if (!committed?.ok) throw new Error("The correction did not commit. Nothing was changed.");

      onSaved?.({
        first_name: committed.first_name,
        last_name: committed.last_name,
        state: committed.state,
        doctor_user_id: committed.doctor_user_id,
        doctor_status: committed.doctor_status,
      });

      const bits = [`Saved. ${committed.new_pet_count} pet${committed.new_pet_count === 1 ? "" : "s"} on this order.`];
      if (committed.provider_reassignment_required) bits.push("The provider was unassigned — reassign a licensed provider.");
      if (committed.document_reissue_required) bits.push("Customer details changed after document issuance. Updated documentation is required — the order is back with the provider for review.");
      if (committed.replayed) bits.push("(This request had already been applied; nothing was duplicated.)");
      setSuccess(bits.join(" "));
      idemRef.current = crypto.randomUUID();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Nothing was changed.");
    }
    busyRef.current = false;
    setBusy(false);
  }

  const entitlementLabel = state
    ? (state.entitlement_known ? `${state.purchased_pet_limit} pet${state.purchased_pet_limit === 1 ? "" : "s"}` : "Not recorded")
    : "—";

  return (
    <>
      <button
        type="button"
        role="menuitem"
        onClick={() => setOpen(true)}
        className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
      >
        <i className="ri-user-settings-line text-[#3b6ea5]"></i>Edit Customer &amp; Pets
      </button>

      {open && (
        <DialogHost onRequestClose={() => { if (!busy) { setOpen(false); onCloseMenu(); } }}>
          <div className="bg-white rounded-2xl w-full max-w-2xl my-2 sm:my-0 sm:max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="px-4 sm:px-5 py-3.5 border-b border-gray-200 flex items-center justify-between gap-2 sticky top-0 bg-white z-10">
              <p className="text-sm font-extrabold text-[#1e3a5f] flex items-center gap-2 min-w-0">
                <i className="ri-user-settings-line text-[#3b6ea5] shrink-0"></i>
                <span className="truncate">Edit Customer &amp; Pets</span>
              </p>
              <button type="button" disabled={busy} onClick={() => { setOpen(false); onCloseMenu(); }}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-40 cursor-pointer shrink-0" aria-label="Close">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              {loading && (
                <p className="text-xs font-semibold text-gray-500 flex items-center gap-2">
                  <i className="ri-loader-4-line animate-spin"></i>Loading the order…
                </p>
              )}
              {loadError && (
                <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{loadError}</p>
              )}

              {state && !loading && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
                    {[
                      ["Order", state.confirmation_id ?? "—"],
                      ["Purchased entitlement", entitlementLabel],
                      ["Current pets", `${state.pet_count}${state.approved_added_pets ? ` (+${state.approved_added_pets} added)` : ""}`],
                      ["Maximum", `${maxPets} pets`],
                    ].map(([k, v]) => (
                      <div key={k} className="min-w-0">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{k}</p>
                        <p className="text-xs font-semibold text-gray-800 break-words">{v}</p>
                      </div>
                    ))}
                  </div>
                  {!state.entitlement_known && (
                    <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      No purchased-entitlement snapshot exists for this order, so adding a pet always requires a
                      paid Additional Pet invoice. Correcting or removing existing pets is unaffected.
                    </p>
                  )}

                  <div className="space-y-3">
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Customer details</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Field label="First name" hint={`Current: ${state.first_name || "—"}`}>
                        <input value={first} onChange={(e) => setFirst(e.target.value.slice(0, 100))} className={INPUT} />
                      </Field>
                      <Field label="Last name" hint={`Current: ${state.last_name || "—"}`}>
                        <input value={last} onChange={(e) => setLast(e.target.value.slice(0, 100))} className={INPUT} />
                      </Field>
                      <Field label="State" hint={`Current: ${state.state || "—"}`}>
                        <select value={stateCode} onChange={(e) => setStateCode(e.target.value)} className={INPUT}>
                          <option value="">— No state —</option>
                          {US_STATES.map((s) => (
                            <option key={s.code} value={s.code}>{s.code} · {s.name}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                        Pets · {pets.length} of {maxPets}
                      </p>
                      <button type="button" onClick={addPet} disabled={pets.length >= maxPets}
                        className="whitespace-nowrap flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 cursor-pointer">
                        <i className="ri-add-line"></i>Add pet
                      </button>
                    </div>

                    {pets.map((p, i) => (
                      <div key={i} className="border border-gray-200 rounded-xl p-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-extrabold text-[#1e3a5f]">Pet {i + 1}</p>
                          <button type="button" onClick={() => removePet(i)} disabled={pets.length <= MIN_PETS_PER_ORDER}
                            title={pets.length <= MIN_PETS_PER_ORDER ? "An order must keep at least one pet" : "Remove this pet"}
                            className="whitespace-nowrap flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-gray-200 text-red-600 bg-white hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
                            <i className="ri-delete-bin-line"></i>Remove
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Field label="Pet name">
                            <input value={p.name} onChange={(e) => patchPet(i, { name: e.target.value.slice(0, 120) })} className={INPUT} />
                          </Field>
                          <Field label="Animal type">
                            <select value={PET_TYPES.includes(p.type) ? p.type : (p.type ? "Other" : "")}
                              onChange={(e) => patchPet(i, { type: e.target.value })} className={INPUT}>
                              <option value="">— Select —</option>
                              {PET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </Field>
                          <Field label="Breed">
                            <input value={p.breed} onChange={(e) => patchPet(i, { breed: e.target.value.slice(0, 120) })} className={INPUT} />
                          </Field>
                          <Field label="Age">
                            <input value={p.age} onChange={(e) => patchPet(i, { age: e.target.value.slice(0, 40) })} className={INPUT} />
                          </Field>
                          <Field label="Weight">
                            <input value={p.weight} onChange={(e) => patchPet(i, { weight: e.target.value.slice(0, 40) })} className={INPUT} />
                          </Field>
                        </div>
                      </div>
                    ))}

                    {ceilingExceeded && (
                      <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        This order already covers {state.approved_added_pets} approved additional pet(s), so {pets.length} pet
                        rows would exceed the {maxPets}-pet maximum.
                      </p>
                    )}
                  </div>

                  {growth > 0 && (
                    <div className={`rounded-xl border px-3 py-3 space-y-2.5 ${paymentBlocked ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
                      {paymentBlocked ? (
                        <>
                          <p className="text-xs font-bold text-amber-900">{PAYMENT_REQUIRED_MESSAGE}</p>
                          <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                            <div className="flex-1 min-w-0">
                              <label className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Invoice amount (USD)</label>
                              <input type="number" min="1" step="0.01" value={invoiceAmount}
                                onChange={(e) => setInvoiceAmount(e.target.value)} placeholder="0.00"
                                className="mt-1 w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white focus:outline-none focus:border-amber-500" />
                            </div>
                            <button type="button" onClick={sendAdditionalPetInvoice} disabled={invoiceBusy}
                              className="whitespace-nowrap flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 disabled:opacity-40 cursor-pointer">
                              {invoiceBusy ? <><i className="ri-loader-4-line animate-spin"></i>Sending…</> : <><i className="ri-bill-line"></i>Send Additional Pet invoice</>}
                            </button>
                            <button type="button" onClick={() => void load()} disabled={loading}
                              className="whitespace-nowrap flex items-center justify-center gap-1.5 px-3 py-2 border border-amber-300 text-amber-900 bg-white text-xs font-bold rounded-lg hover:bg-amber-100 disabled:opacity-40 cursor-pointer">
                              <i className="ri-refresh-line"></i>Re-check payment
                            </button>
                          </div>
                          <p className="text-[10px] text-amber-800 leading-snug">
                            You set the amount. Only a request that is actually PAID counts — sent, open, pending,
                            failed, voided and expired invoices never authorise a pet.
                          </p>
                          {invoiceMsg && <p className="text-[11px] font-semibold text-amber-900">{invoiceMsg}</p>}
                        </>
                      ) : (
                        <>
                          <p className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                            <i className="ri-checkbox-circle-line"></i>
                            Paid Additional Pet invoice found — this addition is covered.
                          </p>
                          <ul className="space-y-1">
                            {state.available_authorizations.slice(0, growth).map((a) => (
                              <li key={a.id} className="text-[11px] text-emerald-900 break-words">
                                {money(a.amount_cents)} · paid {new Date(a.paid_at).toLocaleDateString("en-US")}
                                {a.stripe_invoice_id ? ` · ${a.stripe_invoice_id}` : ""}
                              </li>
                            ))}
                          </ul>
                          <p className="text-[10px] text-emerald-800 leading-snug">
                            Each paid invoice authorises exactly one pet and is consumed on save.
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  {somethingChanged && (
                    <div className="rounded-xl border border-[#dbe4f0] bg-[#e8f0f9] px-3 py-3 space-y-1.5">
                      <p className="text-[11px] font-bold text-[#1e3a5f] uppercase tracking-wider">Before → after</p>
                      <Delta label="First name" before={state.first_name ?? ""} after={first.trim()} />
                      <Delta label="Last name" before={state.last_name ?? ""} after={last.trim()} />
                      <Delta label="State" before={state.state ?? ""} after={stateCode} />
                      <Delta label="Pet count" before={String(state.pet_count)} after={String(pets.length)} />
                      {pets.map((p, i) => {
                        const o = toEditable((state.pets[i] ?? {}) as Record<string, unknown>);
                        return (
                          <Delta key={`d-${i}`} label={`Pet ${i + 1}`}
                            before={[o.name, o.type].filter(Boolean).join(" · ")}
                            after={[p.name.trim(), p.type.trim()].filter(Boolean).join(" · ")} />
                        );
                      })}
                    </div>
                  )}

                  <div className="space-y-2">
                    {providerMissing && stateChanged && (
                      <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        No provider is assigned to this order. The state correction is allowed; assignment is still required.
                      </p>
                    )}
                    {stateChanged && (
                      <label className="flex items-start gap-2 text-[11px] text-gray-700 cursor-pointer">
                        <input type="checkbox" checked={confirmState} onChange={(e) => setConfirmState(e.target.checked)} className="mt-0.5 shrink-0" />
                        <span>I confirm the customer&apos;s state changes from <b>{state.state || "—"}</b> to <b>{stateCode || "—"}</b>.</span>
                      </label>
                    )}
                    {providerIneligible && (
                      <label className="flex items-start gap-2 text-[11px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2 cursor-pointer">
                        <input type="checkbox" checked={confirmProvider} onChange={(e) => setConfirmProvider(e.target.checked)} className="mt-0.5 shrink-0" />
                        <span>
                          <b>{state.assigned_provider?.full_name ?? "The assigned provider"}</b> is not licensed in {stateCode}.
                          Saving will unassign them and return the order to the unassigned queue for manual reassignment.
                          No replacement provider is chosen automatically.
                        </span>
                      </label>
                    )}
                    {removalCount > 0 && (
                      <label className="flex items-start gap-2 text-[11px] text-gray-700 cursor-pointer">
                        <input type="checkbox" checked={confirmRemoval} onChange={(e) => setConfirmRemoval(e.target.checked)} className="mt-0.5 shrink-0" />
                        <span>I confirm removing {removalCount} pet{removalCount === 1 ? "" : "s"} from this order.</span>
                      </label>
                    )}
                    {isCompleted && (
                      <label className="flex items-start gap-2 text-[11px] text-gray-700 cursor-pointer">
                        <input type="checkbox" checked={confirmCompleted} onChange={(e) => setConfirmCompleted(e.target.checked)} className="mt-0.5 shrink-0" />
                        <span>I confirm editing a <b>completed</b> order.</span>
                      </label>
                    )}
                    {reissueRequired && (
                      <label className="flex items-start gap-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 cursor-pointer">
                        <input type="checkbox" checked={confirmReissue} onChange={(e) => setConfirmReissue(e.target.checked)} className="mt-0.5 shrink-0" />
                        <span>
                          Customer details changed after document issuance. Updated documentation is required.
                          The existing letter and its verification history are preserved untouched — saving returns
                          the order to provider review so a new version can be issued through the normal pipeline.
                        </span>
                      </label>
                    )}
                  </div>

                  <Field label="Correction reason (required)"
                    hint="Recorded in the audit trail. At least 5 characters, plain text.">
                    <textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 1000))} rows={2}
                      placeholder="e.g. Customer called — last name was misspelled on the intake form."
                      className={`${INPUT} resize-none`} />
                  </Field>

                  {error && <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
                  {success && <p className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{success}</p>}

                  <button type="button" onClick={save} disabled={!canSave}
                    className="w-full whitespace-nowrap flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors">
                    {busy ? <><i className="ri-loader-4-line animate-spin"></i>Saving…</> : <><i className="ri-save-line"></i>Save correction</>}
                  </button>
                  {!somethingChanged && (
                    <p className="text-[10px] text-gray-400 text-center">Nothing has been changed yet.</p>
                  )}
                </>
              )}
            </div>
          </div>
        </DialogHost>
      )}
    </>
  );
}
