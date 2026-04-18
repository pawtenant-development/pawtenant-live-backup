/**
 * providerEligibility.ts
 * Single source of truth for provider-state eligibility checks.
 *
 * A provider is eligible for a state if ANY of the following is true:
 *  1. licensed_states includes the full state name  (e.g. "Texas")
 *  2. licensed_states includes the 2-letter abbr    (e.g. "TX")
 *  3. licensed_states contains a full name whose abbr matches the order state abbr
 *  4. state_license_numbers has a key matching the order state abbr (fallback guard)
 *
 * Rule 4 is the safety net: it catches the case where a license number was saved
 * for a state but the licensed_states array was not updated in sync.
 */

const US_STATES_ABBR_MAP: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK",
  Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
  Vermont: "VT", Virginia: "VA", Washington: "WA", "Washington DC": "DC",
  "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
};

const US_STATES_NAME_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(US_STATES_ABBR_MAP).map(([name, abbr]) => [abbr, name])
);

export interface ProviderForEligibility {
  licensed_states?: string[] | null;
  state_license_numbers?: Record<string, string> | null;
  is_active?: boolean | null;
}

/**
 * Returns true if the provider is eligible to handle an order from `orderStateAbbr`.
 * Pass `checkActive = true` (default) to also require is_active !== false.
 */
export function isProviderEligibleForState(
  provider: ProviderForEligibility,
  orderStateAbbr: string,
  checkActive = true,
): boolean {
  if (checkActive && provider.is_active === false) return false;
  if (!orderStateAbbr) return true; // no state on order — show all active providers

  const abbr = orderStateAbbr.toUpperCase().trim();
  const fullName = US_STATES_NAME_MAP[abbr] ?? "";

  const states = provider.licensed_states ?? [];

  // Rule 1: full name match (e.g. "Texas")
  if (fullName && states.includes(fullName)) return true;

  // Rule 2: abbr match (e.g. "TX")
  if (states.includes(abbr)) return true;

  // Rule 3: a stored full name maps to the target abbr
  if (states.some((s) => US_STATES_ABBR_MAP[s] === abbr)) return true;

  // Rule 4: state_license_numbers has a key for this abbr (safety net)
  const licNums = provider.state_license_numbers;
  if (licNums && Object.prototype.hasOwnProperty.call(licNums, abbr)) return true;

  return false;
}
