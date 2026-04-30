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

// OPS-PROVIDER-LICENSE-STATE-NORMALIZATION-PHASE-A: shared display helpers
// for collapsing legacy mixed state/license storage at render time.
// These helpers MUST NOT touch persisted data — they are read-only.

/**
 * One displayable licensed-state entry, deduped by canonical 2-letter code.
 * `rawValues` keeps the original strings (codes, full names, mixed) so
 * downstream UI can still react to either form when needed.
 */
export interface DisplayState {
  code: string;       // e.g. "VA"
  label: string;      // e.g. "Virginia"
  rawValues: string[]; // every original string that mapped to `code`
}

/**
 * Normalize an array of stored licensed_states into a deduped, code-keyed
 * display list. Unmappable entries are kept under `rawValues` of a
 * pseudo-row whose `code === null` semantically — but to keep the return
 * type uniform, we surface them as their own entries with code = the raw
 * upper-cased value and label = the raw value. They will simply not match
 * the canonical state list. Caller can detect them via `code` not being a
 * real US state code.
 */
export function normalizeStateListForDisplay(
  raw: ReadonlyArray<string | null | undefined> | null | undefined,
): DisplayState[] {
  if (!raw || raw.length === 0) return [];
  const byCode = new Map<string, DisplayState>();
  const unmapped: DisplayState[] = [];
  for (const value of raw) {
    if (value === null || value === undefined) continue;
    const trimmed = String(value).trim();
    if (!trimmed) continue;
    const code = normalizeStateToCode(trimmed);
    if (code) {
      const existing = byCode.get(code);
      if (existing) {
        if (!existing.rawValues.includes(trimmed)) existing.rawValues.push(trimmed);
      } else {
        byCode.set(code, {
          code,
          label: US_STATE_CODE_TO_NAME[code] ?? trimmed,
          rawValues: [trimmed],
        });
      }
    } else {
      // Preserve unmappable values in the order they arrived.
      const fallbackKey = trimmed.toUpperCase();
      const existing = unmapped.find((u) => u.code === fallbackKey);
      if (existing) {
        if (!existing.rawValues.includes(trimmed)) existing.rawValues.push(trimmed);
      } else {
        unmapped.push({ code: fallbackKey, label: trimmed, rawValues: [trimmed] });
      }
    }
  }
  // Stable order: alphabetic by label for the canonical entries, then
  // unmapped in insertion order.
  const canonical = Array.from(byCode.values()).sort((a, b) => a.label.localeCompare(b.label));
  return [...canonical, ...unmapped];
}

/**
 * One displayable license row — keyed by canonical state code, with the
 * underlying license number(s) consolidated. When two legacy keys (e.g.
 * "VA" and "Virginia") point to the SAME license number, the row collapses
 * to a single entry. When they point to DIFFERENT numbers, `conflict` is
 * true and `licenseNumbers` lists every distinct value so callers can
 * surface it without silently losing data.
 */
export interface DisplayLicense {
  code: string;             // canonical 2-letter code OR raw upper-cased fallback
  label: string;            // full state name OR raw value
  licenseNumber: string;    // primary value (first non-empty seen)
  licenseNumbers: string[]; // every distinct license value seen for this code
  conflict: boolean;        // true when more than one distinct license value exists
  rawKeys: string[];        // the original key strings that mapped to `code`
}

/**
 * Normalize a stored state_license_numbers JSON object (keyed by codes,
 * full names, or both) into a deduped, code-keyed display list.
 * Empty / whitespace-only license values are skipped.
 */
export function normalizeLicenseMapForDisplay(
  raw: Record<string, string | null | undefined> | null | undefined,
): DisplayLicense[] {
  if (!raw) return [];
  const byCode = new Map<string, DisplayLicense>();
  const unmapped: DisplayLicense[] = [];
  for (const [k, v] of Object.entries(raw)) {
    if (k === null || k === undefined) continue;
    const keyTrimmed = String(k).trim();
    if (!keyTrimmed) continue;
    const valTrimmed = (v ?? "").toString().trim();
    if (!valTrimmed) continue;
    const code = normalizeStateToCode(keyTrimmed);
    const targetCode = code ?? keyTrimmed.toUpperCase();
    const targetLabel = code ? (US_STATE_CODE_TO_NAME[code] ?? keyTrimmed) : keyTrimmed;
    const bucket = code ? byCode : null;
    let existing: DisplayLicense | undefined;
    if (bucket) existing = bucket.get(targetCode);
    else existing = unmapped.find((u) => u.code === targetCode);
    if (existing) {
      if (!existing.rawKeys.includes(keyTrimmed)) existing.rawKeys.push(keyTrimmed);
      if (!existing.licenseNumbers.includes(valTrimmed)) existing.licenseNumbers.push(valTrimmed);
      existing.conflict = existing.licenseNumbers.length > 1;
    } else {
      const row: DisplayLicense = {
        code: targetCode,
        label: targetLabel,
        licenseNumber: valTrimmed,
        licenseNumbers: [valTrimmed],
        conflict: false,
        rawKeys: [keyTrimmed],
      };
      if (bucket) bucket.set(targetCode, row);
      else unmapped.push(row);
    }
  }
  const canonical = Array.from(byCode.values()).sort((a, b) => a.label.localeCompare(b.label));
  return [...canonical, ...unmapped];
}
