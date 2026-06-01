// Accounts "monthly books" date helpers. Pure functions (no React, no fetch).
//
// Timezone note: PawTenant's Payments/Accounts data is keyed on calendar dates
// using the browser's LOCAL date (the existing Payments custom-range inputs and
// companyExpenses.resolveRange already behave this way). To avoid UTC off-by-one
// drift on month boundaries we format dates from LOCAL components here rather
// than via toISOString(). Document: ranges use the operator's local calendar day.

export type AccountsPreset =
  | "current_month"
  | "last_month"
  | "last_30d"
  | "ytd"
  | "all_time"
  | "custom";

export interface ResolvedAccountsRange {
  from: string; // YYYY-MM-DD inclusive
  to: string;   // YYYY-MM-DD inclusive
  label: string;
  preset: AccountsPreset;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// All-time floor — earliest date we consider "all data". Safe lower bound.
export const ALL_TIME_FROM = "2020-01-01";

// Format a Date to YYYY-MM-DD using LOCAL components (no UTC conversion).
export function localIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function firstOfMonth(year: number, monthIdx: number): Date {
  return new Date(year, monthIdx, 1);
}
function lastOfMonth(year: number, monthIdx: number): Date {
  return new Date(year, monthIdx + 1, 0); // day 0 of next month = last day of this month
}

export function monthLabel(year: number, monthIdx: number): string {
  return `${MONTH_NAMES[monthIdx]} ${year}`;
}

// "YYYY-MM" bucket key for a JS Date.
export function monthKeyOfDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
// "YYYY-MM" bucket key from a Unix-seconds timestamp (Stripe `created`).
export function monthKeyOfUnix(unixSeconds: number): string {
  return monthKeyOfDate(new Date(unixSeconds * 1000));
}

// Resolve a preset into a concrete date range + display label.
export function presetRange(preset: AccountsPreset, now: Date = new Date()): ResolvedAccountsRange {
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = localIso(now);

  switch (preset) {
    case "current_month":
      return {
        from: localIso(firstOfMonth(y, m)),
        to: localIso(lastOfMonth(y, m)),
        label: `${monthLabel(y, m)} Books`,
        preset,
      };
    case "last_month": {
      const lm = new Date(y, m - 1, 1);
      return {
        from: localIso(firstOfMonth(lm.getFullYear(), lm.getMonth())),
        to: localIso(lastOfMonth(lm.getFullYear(), lm.getMonth())),
        label: `${monthLabel(lm.getFullYear(), lm.getMonth())} Books`,
        preset,
      };
    }
    case "last_30d": {
      const fromD = new Date(now);
      fromD.setDate(fromD.getDate() - 29);
      return { from: localIso(fromD), to: today, label: "Last 30 Days", preset };
    }
    case "ytd":
      return { from: localIso(new Date(y, 0, 1)), to: today, label: `Year to Date ${y}`, preset };
    case "all_time":
      return { from: ALL_TIME_FROM, to: today, label: "All Time", preset };
    case "custom":
    default:
      return { from: localIso(firstOfMonth(y, m)), to: localIso(lastOfMonth(y, m)), label: "Custom Range", preset };
  }
}

// Preset buttons shown in the Accounts range bar (custom handled separately).
export const ACCOUNTS_PRESET_BUTTONS: { key: AccountsPreset; label: string }[] = [
  { key: "current_month", label: "Current Month" },
  { key: "last_month", label: "Last Month" },
  { key: "last_30d", label: "Last 30 Days" },
  { key: "ytd", label: "Year to Date" },
  { key: "all_time", label: "All Time" },
];

export interface MonthlyPeriod {
  key: string;     // YYYY-MM
  label: string;   // "June 2026"
  from: string;
  to: string;
  isCurrent: boolean;
  status: "open" | "review"; // current = open, past = review (closed = future feature)
}

// The last `count` calendar months, most recent first (current month included as row 0).
export function monthlyPeriods(count: number, now: Date = new Date()): MonthlyPeriod[] {
  const out: MonthlyPeriod[] = [];
  const curKey = monthKeyOfDate(now);
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const mi = d.getMonth();
    const key = monthKeyOfDate(d);
    const isCurrent = key === curKey;
    out.push({
      key,
      label: monthLabel(y, mi),
      from: localIso(firstOfMonth(y, mi)),
      to: localIso(lastOfMonth(y, mi)),
      isCurrent,
      status: isCurrent ? "open" : "review",
    });
  }
  return out;
}
