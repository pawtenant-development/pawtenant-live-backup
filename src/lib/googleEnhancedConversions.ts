// Google Ads Enhanced Conversions — identity-only user_data helper.
//
// Sets normalized customer identity fields via gtag('set', 'user_data', ...)
// BEFORE the Google Ads purchase conversion fires. This improves match rates
// in Google Ads without sending any sensitive ESA/PSD/medical/provider/pet
// information.
//
// ALLOWED FIELDS ONLY (per project policy):
//   • email
//   • phone_number  (E.164)
//   • first_name
//   • last_name
//   • postal_code
//   • country       (ISO 3166-1 alpha-2)
//
// NEVER pass: assessment answers, mental-health conditions, diagnoses,
// provider names, pet details, doctor notes, or any medical data.

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export interface EnhancedConversionUserData {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

function normalizeEmail(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const v = String(raw).trim().toLowerCase();
  return v.length > 0 ? v : undefined;
}

// Normalize US/international phone to E.164 (+[country][digits]).
// Per Google Enhanced Conversions spec.
function normalizePhone(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const cleaned = String(raw).replace(/[^\d+]/g, "");
  if (!cleaned) return undefined;
  if (cleaned.startsWith("+")) {
    const digitsOnly = cleaned.slice(1);
    return digitsOnly.length >= 8 ? `+${digitsOnly}` : undefined;
  }
  const digits = cleaned.replace(/^0+/, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8) return `+${digits}`;
  return undefined;
}

function normalizeName(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const v = String(raw).trim().toLowerCase().replace(/\s+/g, "");
  return v.length > 0 ? v : undefined;
}

function normalizePostal(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const v = String(raw).trim().replace(/\s+/g, "");
  return v.length > 0 ? v : undefined;
}

function normalizeCountry(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const v = String(raw).trim().toUpperCase();
  return v.length === 2 ? v : undefined;
}

// Calls gtag('set', 'user_data', {...}) with normalized identity fields.
// Safe to call from any post-purchase page; silently no-ops if gtag is
// unavailable or no usable fields are present. Never throws.
export function setEnhancedConversionUserData(input: EnhancedConversionUserData): void {
  try {
    if (typeof window === "undefined") return;
    if (typeof window.gtag !== "function") return;

    const email = normalizeEmail(input.email);
    const phone_number = normalizePhone(input.phone);
    const first_name = normalizeName(input.firstName);
    const last_name = normalizeName(input.lastName);
    const postal_code = normalizePostal(input.postalCode);
    const country = normalizeCountry(input.country);

    // Require at least one real identity field. Country alone is useless to
    // Google and would generate noisy empty user_data calls.
    const hasIdentity = Boolean(email || phone_number || first_name || last_name || postal_code);
    if (!hasIdentity) return;

    // PawTenant is a US-only product; default to "US" only when we're already
    // sending real identity fields that can be matched.
    const finalCountry = country ?? "US";

    const address: Record<string, string> = {};
    if (first_name) address.first_name = first_name;
    if (last_name) address.last_name = last_name;
    if (postal_code) address.postal_code = postal_code;
    if (finalCountry) address.country = finalCountry;

    const payload: Record<string, unknown> = {};
    if (email) payload.email = email;
    if (phone_number) payload.phone_number = phone_number;
    if (Object.keys(address).length > 0) payload.address = address;

    window.gtag("set", "user_data", payload);

    // Diagnostic-only log — never logs raw PII, only which fields were present.
    // eslint-disable-next-line no-console
    console.log("[EnhancedConversions] user_data set", {
      has_email: Boolean(email),
      has_phone: Boolean(phone_number),
      has_first_name: Boolean(first_name),
      has_last_name: Boolean(last_name),
      has_postal_code: Boolean(postal_code),
      country,
    });
  } catch {
    // Never block conversion firing or checkout
  }
}
