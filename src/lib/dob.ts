// Shared Date-of-Birth helpers for ADMIN-ONLY exports.
//
// PRIVACY / COMPLIANCE (do not remove):
// DOB is sensitive personal data. The customer provides it once in the
// assessment (Step 2) and it lives in `orders.assessment_answers.dob` as a
// plain "YYYY-MM-DD" string. These helpers surface DOB ONLY for admin-only CSV
// exports used for audience matching. DOB / age must never be shown in public
// UI, provider UI, or any customer-facing surface.
//
// Age is ALWAYS calculated at export time from DOB — it is never stored.
// We never invent a DOB or an age: if the source value is missing or invalid,
// these helpers return "" (blank) so the export cell stays empty.

interface HasAssessmentAnswers {
  assessment_answers?: unknown;
}

// Pull the raw DOB out of the order's assessment answers and normalise it to
// "YYYY-MM-DD". Returns "" when no usable DOB exists.
export function extractDob(o: HasAssessmentAnswers): string {
  const a = o.assessment_answers;
  if (!a || typeof a !== "object") return "";
  const raw = (a as Record<string, unknown>).dob;
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // Already ISO-ish ("YYYY-MM-DD" or "YYYY-MM-DDThh:mm…") — take the date part.
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // Fallback: try to parse other formats, then re-emit as YYYY-MM-DD.
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

// Birth year ("YYYY") from a normalised DOB. "" when DOB is blank/invalid.
export function dobBirthYear(dobYMD: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(dobYMD) ? dobYMD.slice(0, 4) : "";
}

// Age in whole years as of `now`, calculated from a normalised DOB.
// Returns "" when DOB is blank/invalid or the computed age is out of range.
export function dobToAge(dobYMD: string, now: Date = new Date()): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dobYMD)) return "";
  const birth = new Date(dobYMD + "T00:00:00");
  if (isNaN(birth.getTime())) return "";
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
  if (age < 0 || age > 120) return ""; // sanity bounds — drop impossible values
  return String(age);
}
