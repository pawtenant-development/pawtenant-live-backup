/**
 * Canonical U.S. states list — 50 states + Washington DC = 51 entries.
 *
 * Single source of truth for any UI that lists U.S. states (assessment Step 2,
 * admin coverage banner, etc.). Use this instead of the older mocks/doctors
 * ALL_STATES list which was incomplete (missing AR, MO, PA, SD, TN).
 *
 * For provider-eligibility checks during ASSIGNMENT, continue to use
 * src/pages/admin-orders/components/providerEligibility.ts — that file owns
 * the assignment-rule semantics and is intentionally not refactored here.
 */

export interface USStateOption {
  code: string;
  name: string;
}

export const US_STATES: USStateOption[] = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DC", name: "District of Columbia" },
  { code: "DE", name: "Delaware" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "IA", name: "Iowa" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "MA", name: "Massachusetts" },
  { code: "MD", name: "Maryland" },
  { code: "ME", name: "Maine" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MO", name: "Missouri" },
  { code: "MS", name: "Mississippi" },
  { code: "MT", name: "Montana" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "NE", name: "Nebraska" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NV", name: "Nevada" },
  { code: "NY", name: "New York" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VA", name: "Virginia" },
  { code: "VT", name: "Vermont" },
  { code: "WA", name: "Washington" },
  { code: "WI", name: "Wisconsin" },
  { code: "WV", name: "West Virginia" },
  { code: "WY", name: "Wyoming" },
];

export const US_STATE_CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  US_STATES.map((s) => [s.code, s.name]),
);

export const US_STATE_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  US_STATES.map((s) => [s.name, s.code]),
);

// Lowercased name → code map for case-insensitive full-name lookup.
const US_STATE_LOWER_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  US_STATES.map((s) => [s.name.toLowerCase(), s.code]),
);

// Common Washington DC variants that we want to fold into the canonical "DC" code.
// Keys are lowercased and stripped of periods to make matching forgiving.
const DC_VARIANT_KEYS = new Set<string>([
  "dc",
  "d c",
  "washington dc",
  "washington d c",
  "district of columbia",
]);

/**
 * Normalize a stored "licensed_states" entry — which may be a 2-letter code
 * (e.g. "TX"), a full name (e.g. "Texas", case-insensitive), or one of the
 * common Washington DC variants ("Washington DC", "Washington D.C.",
 * "District of Columbia", "D.C.", "DC") — to its 2-letter code.
 * Returns null when the value is not a recognized state.
 */
export function normalizeStateToCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // Try 2-letter abbr first (e.g. "TX", "tx", "Tx").
  const upper = trimmed.toUpperCase();
  if (US_STATE_CODE_TO_NAME[upper]) return upper;

  // Case-insensitive full-name match (e.g. "Texas", "texas", "TEXAS").
  const lower = trimmed.toLowerCase();
  if (US_STATE_LOWER_NAME_TO_CODE[lower]) return US_STATE_LOWER_NAME_TO_CODE[lower];

  // DC variants — strip periods and collapse whitespace, then check the variant set.
  const dcKey = lower.replace(/\./g, "").replace(/\s+/g, " ").trim();
  if (DC_VARIANT_KEYS.has(dcKey)) return "DC";

  return null;
}
