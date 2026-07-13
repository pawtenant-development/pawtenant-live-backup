// Shared, presentation-only helpers for the customer portal order hub
// (CUSTOMER-PORTAL-ACCOUNT-HUB-REDESIGN-001). Derive product / package / billing
// labels from order metadata (never guessed from price except a labelled legacy
// fallback). Used by OrderSwitcher, SelectedOrderHeader, CustomerPortalHeader.

export interface OrderLike {
  confirmation_id: string;
  letter_type?: string | null;
  plan_type?: string | null;
  billing_plan?: string | null;
  package_display_name?: string | null;
  includes_reasonable_accommodation_letter?: boolean | null;
  price?: number | null;
  payment_intent_id?: string | null;
  status?: string;
  doctor_status?: string | null;
  refunded_at?: string | null;
  assessment_answers?: Record<string, unknown> | null;
}

export function isPSD(o: OrderLike): boolean {
  return o.letter_type === "psd" || (o.confirmation_id?.includes("-PSD") ?? false);
}

/** Long product label. */
export function productLabel(o: OrderLike): string {
  return isPSD(o) ? "PSD Documentation" : "ESA Letter";
}

/** Package name from stored metadata; derived fallback only when absent. */
export function packageName(o: OrderLike): string {
  if (o.package_display_name) return o.package_display_name;
  const psd = isPSD(o);
  if (o.includes_reasonable_accommodation_letter) {
    return psd ? "PSD + Reasonable Accommodation" : "ESA + Reasonable Accommodation";
  }
  return psd ? "Standard PSD" : "Standard ESA";
}

/** Short package tag for compact chips. */
export function packageShort(o: OrderLike): string {
  return o.includes_reasonable_accommodation_letter ? "+ Reasonable Accommodation" : "Standard";
}

export function isAnnual(o: OrderLike): boolean {
  const bp = (o.billing_plan ?? "").toLowerCase();
  if (bp === "annual") return true;
  if (bp === "one_time") return false;
  const pt = (o.plan_type ?? "").toLowerCase();
  return pt.includes("subscription") || pt.includes("annual");
}

export function billingLabel(o: OrderLike): string {
  return isAnnual(o) ? "Annual plan" : "One-time";
}

export function isPaid(o: OrderLike): boolean {
  return !!o.payment_intent_id;
}

export function petCount(o: OrderLike): number | null {
  const pets = o.assessment_answers?.pets;
  if (Array.isArray(pets) && pets.length > 0) return pets.length;
  return null;
}
