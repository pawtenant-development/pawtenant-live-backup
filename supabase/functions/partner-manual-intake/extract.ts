// partner-manual-intake/extract.ts
//
// PARTNER-MULTI-BRAND-MANUAL-PDF-ORDER-INGESTION-001
//
// Pure, deterministic field extraction over the TEXT of a partner's paid-order
// PDF (one string per page, produced by the text layer or by OCR). No I/O, no
// logging, no network — it is executed verbatim by the build guard.
//
// PRINCIPLES
//   * NEVER INVENT. A field that is not evidenced in the text is reported as
//     missing (value null) with a warning, never defaulted.
//   * EVERY VALUE CARRIES PROVENANCE: source page, extraction method and a
//     confidence in [0,1]. Anything below REVIEW_THRESHOLD is highlighted for
//     the reviewing admin.
//   * SERVICE FAMILY FAILS CLOSED. ESA versus PSD is decided only from an
//     explicit product/service label or from unambiguous document evidence;
//     contradictory evidence yields service = null + `service_conflict` so a
//     human must resolve it. The parser never guesses.
//   * NO PARTNER BRAND LOGIC. The parser does not know which partner produced
//     the document.

export const EXTRACTION_ENGINE = "pawtenant-intake-parser";
export const EXTRACTION_VERSION = "1.0.0";
/** Fields with confidence below this are highlighted for review. */
export const REVIEW_THRESHOLD = 0.85;

export type ExtractionMethod = "label" | "pattern" | "inferred";

export interface ExtractedField {
  value: string | null;
  page: number | null;
  method: ExtractionMethod | null;
  confidence: number;
  warnings: string[];
}

export interface ExtractedPet {
  name: ExtractedField;
  type: ExtractedField;
  breed: ExtractedField;
  age: ExtractedField;
  weight: ExtractedField;
}

export interface ExtractedQa {
  question: string;
  answer: string;
  page: number;
  confidence: number;
}

export interface PageText {
  page: number;
  text: string;
}

export interface ExtractionResult {
  fields: Record<IntakeFieldKey, ExtractedField>;
  pets: ExtractedPet[];
  qa: ExtractedQa[];
  warnings: string[];
  /** Total characters seen — the caller uses it to decide OCR fallback. */
  charCount: number;
}

export type IntakeFieldKey =
  | "external_order_id"
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "address"
  | "state"
  | "date_of_birth"
  | "service"
  | "pet_count"
  | "payment_reference"
  | "paid_status"
  | "order_date"
  | "consultation"
  | "notes";

export const INTAKE_FIELD_KEYS: IntakeFieldKey[] = [
  "external_order_id", "first_name", "last_name", "email", "phone", "address", "state",
  "date_of_birth", "service", "pet_count", "payment_reference", "paid_status", "order_date",
  "consultation", "notes",
];

const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
  "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR",
  "PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
]);

const STATE_NAMES: Record<string, string> = {
  alabama:"AL", alaska:"AK", arizona:"AZ", arkansas:"AR", california:"CA", colorado:"CO", connecticut:"CT",
  delaware:"DE", florida:"FL", georgia:"GA", hawaii:"HI", idaho:"ID", illinois:"IL", indiana:"IN", iowa:"IA",
  kansas:"KS", kentucky:"KY", louisiana:"LA", maine:"ME", maryland:"MD", massachusetts:"MA", michigan:"MI",
  minnesota:"MN", mississippi:"MS", missouri:"MO", montana:"MT", nebraska:"NE", nevada:"NV",
  "new hampshire":"NH", "new jersey":"NJ", "new mexico":"NM", "new york":"NY", "north carolina":"NC",
  "north dakota":"ND", ohio:"OH", oklahoma:"OK", oregon:"OR", pennsylvania:"PA", "rhode island":"RI",
  "south carolina":"SC", "south dakota":"SD", tennessee:"TN", texas:"TX", utah:"UT", vermont:"VT",
  virginia:"VA", washington:"WA", "west virginia":"WV", wisconsin:"WI", wyoming:"WY",
  "district of columbia":"DC",
};

const missing = (warning?: string): ExtractedField => ({
  value: null, page: null, method: null, confidence: 0, warnings: warning ? [warning] : [],
});

const found = (
  value: string, page: number, method: ExtractionMethod, confidence: number, warnings: string[] = [],
): ExtractedField => ({ value: value.trim(), page, method, confidence, warnings });

interface Line { page: number; text: string }

/** Normalise page text into trimmed, non-empty lines with page provenance. */
function toLines(pages: PageText[]): Line[] {
  const out: Line[] = [];
  for (const p of pages) {
    const raw = (p.text ?? "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
    for (const l of raw.split("\n")) {
      const t = l.replace(/\s+/g, " ").trim();
      if (t) out.push({ page: p.page, text: t });
    }
  }
  return out;
}

/**
 * Labelled value on one line ("Email: x", "Email — x", "Email x" when the
 * label is followed by a separator). Returns the value after the label.
 */
function labelled(line: string, labels: RegExp): string | null {
  const m = line.match(labels);
  if (!m) return null;
  const rest = line.slice(m[0].length).replace(/^[\s:\-–—#]+/, "").trim();
  return rest || null;
}

/** Labelled value whose VALUE sits on the following line ("Email" \n "x"). */
function labelledNext(lines: Line[], i: number, labels: RegExp): string | null {
  const l = lines[i];
  if (!l) return null;
  const m = l.text.match(labels);
  if (!m) return null;
  const rest = l.text.slice(m[0].length).replace(/^[\s:\-–—#]+/, "").trim();
  if (rest) return null; // handled by labelled()
  const next = lines[i + 1];
  if (!next || next.page !== l.page) return null;
  if (/[:：]\s*\S/.test(next.text) && !/@/.test(next.text)) return null; // the next line is itself a label
  return next.text;
}

const L = {
  orderId: /^(partner\s+)?(order|invoice|confirmation|transaction|reference)(\s*(id|no\.?|number|num|#|ref(erence)?|code))?\b(?!\s*(date|total|status|type|summary|amount|notes?|items?|receipt|details?|information|form|confirmation|history))/i,
  firstName: /^(customer\s+|patient\s+|client\s+)?first\s*name\b/i,
  lastName: /^(customer\s+|patient\s+|client\s+)?(last|family|sur)\s*name\b/i,
  fullName: /^(customer|patient|client|full|legal|applicant|owner|buyer|billing)?\s*name\b(?!\s*(of\s+(pet|dog|animal)))/i,
  email: /^(customer\s+|patient\s+|client\s+|contact\s+)?e-?mail(\s*address)?\b/i,
  phone: /^(customer\s+|patient\s+|client\s+|contact\s+|mobile\s+|cell\s+)?(phone|telephone|mobile|cell)(\s*(number|no\.?))?\b/i,
  address: /^(customer\s+|patient\s+|client\s+|mailing\s+|billing\s+|shipping\s+|home\s+|street\s+)?address\b/i,
  state: /^(customer\s+|patient\s+|client\s+|current\s+|residence\s+|residential\s+|physical\s+|home\s+)?state(\s*(of\s+residence|code))?\b/i,
  dob: /^(date\s*of\s*birth|dob|birth\s*date|birthday)\b/i,
  service: /^(product|service|package|plan|letter\s*type|order\s*type|item|purchased|purchase|document\s*type|assessment\s*type)(\s*(name|type|description))?\b/i,
  petCount: /^((number|no\.?|count)\s*of\s*(pets|animals|dogs)|pets|animals|total\s*pets)\b/i,
  petName: /^((pet|animal|dog|cat|esa|service\s*dog|companion)\s*(name|#?\s*\d+\s*name)|name\s*of\s*(pet|animal|dog))\b/i,
  petType: /^((pet|animal)\s*)?(type|species|animal\s*type|type\s*of\s*(pet|animal))\b/i,
  breed: /^((pet|animal|dog)\s*)?breed\b/i,
  age: /^((pet|animal|dog)\s*)?age\b/i,
  weight: /^((pet|animal|dog)\s*)?weight\b/i,
  paymentRef: /^(payment\s*(reference|ref\.?|id|confirmation|receipt)|transaction\s*(id|reference|ref\.?|number|no\.?)|charge\s*id|receipt\s*(no\.?|number|id)|stripe\s*(id|charge)|paypal\s*(id|transaction))\b/i,
  paidStatus: /^(payment\s*status|status\s*of\s*payment|paid|payment)\b/i,
  orderDate: /^(order\s*date|date\s*of\s*(order|purchase)|purchase\s*date|purchased\s*(on|at)|paid\s*(on|at)|date)\b/i,
  consultation: /^(consultation|consult|appointment|call|telehealth|video\s*(call|visit)|scheduled)\b/i,
  notes: /^(notes?|comments?|special\s*instructions|additional\s*(information|notes|comments)|remarks)\b/i,
};

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const ADDRESS_STATE_RE = /,\s*([A-Za-z]{2})\s+\d{5}(-\d{4})?\b/;
const DATE_RE = /\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2}|(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/i;

function normaliseState(v: string | null): string | null {
  if (!v) return null;
  const t = v.trim();
  const code = t.toUpperCase().replace(/[^A-Z]/g, "");
  if (code.length === 2 && US_STATES.has(code)) return code;
  const byName = STATE_NAMES[t.toLowerCase().replace(/[^a-z ]/g, "").trim()];
  if (byName) return byName;
  const m = t.match(/\b([A-Z]{2})\b/);
  if (m && US_STATES.has(m[1])) return m[1];
  return null;
}

/** ESA / PSD evidence in a string. */
function serviceEvidence(s: string): { esa: number; psd: number } {
  const esa = (s.match(/\b(esa|emotional\s+support\s+(animal|dog|cat|letter))\b/gi) ?? []).length;
  const psd = (s.match(/\b(psd|psychiatric\s+service\s+(dog|animal|letter)|service\s+dog)\b/gi) ?? []).length;
  return { esa, psd };
}

function isQuestion(text: string): boolean {
  return /\?\s*$/.test(text) && text.length >= 8 && text.length <= 300;
}

/** Any label the field pass recognises — a Q/A answer must not swallow one. */
function isAnyLabel(text: string): boolean {
  return Object.values(L).some((re) => re.test(text));
}

export function extractIntake(pages: PageText[]): ExtractionResult {
  const lines = toLines(pages);
  const charCount = pages.reduce((n, p) => n + (p.text?.length ?? 0), 0);
  const warnings: string[] = [];
  const f: Record<IntakeFieldKey, ExtractedField> = {
    external_order_id: missing("missing"), first_name: missing("missing"), last_name: missing("missing"),
    email: missing("missing"), phone: missing(), address: missing(), state: missing("missing"),
    date_of_birth: missing(), service: missing("missing"), pet_count: missing(),
    payment_reference: missing("missing"), paid_status: missing("missing"), order_date: missing(),
    consultation: missing(), notes: missing(),
  };
  const pets: ExtractedPet[] = [];
  const qa: ExtractedQa[] = [];
  const consumed = new Set<number>();

  const take = (key: IntakeFieldKey, field: ExtractedField) => {
    if (f[key].value === null || field.confidence > f[key].confidence) f[key] = field;
  };

  let currentPet: ExtractedPet | null = null;
  const newPet = (): ExtractedPet => {
    const p: ExtractedPet = { name: missing("missing"), type: missing("missing"), breed: missing(), age: missing(), weight: missing() };
    pets.push(p);
    return p;
  };

  // ── Pass 1: labelled fields, line by line ─────────────────────────────────
  for (let i = 0; i < lines.length; i++) {
    const { page, text } = lines[i];
    const pick = (re: RegExp): { v: string; nextLine: boolean } | null => {
      const inline = labelled(text, re);
      if (inline) return { v: inline, nextLine: false };
      const next = labelledNext(lines, i, re);
      if (next) return { v: next, nextLine: true };
      return null;
    };
    const conf = (r: { nextLine: boolean }, base = 0.92) => (r.nextLine ? base - 0.1 : base);

    let r: { v: string; nextLine: boolean } | null;

    if ((r = pick(L.petName))) { currentPet = newPet(); currentPet.name = found(r.v, page, "label", conf(r)); consumed.add(i); continue; }
    if ((r = pick(L.breed))) { (currentPet ??= newPet()).breed = found(r.v, page, "label", conf(r)); consumed.add(i); continue; }
    if ((r = pick(L.weight))) { (currentPet ??= newPet()).weight = found(r.v.replace(/\s*(lbs?|pounds?)\b/i, ""), page, "label", conf(r)); consumed.add(i); continue; }
    if ((r = pick(L.petType))) { (currentPet ??= newPet()).type = found(r.v, page, "label", conf(r)); consumed.add(i); continue; }
    // "Age" is ambiguous (patient vs pet): attach to a pet only once one exists.
    if (currentPet && (r = pick(L.age))) { currentPet.age = found(r.v.replace(/\s*(years?|yrs?|y\.?o\.?)\b/i, ""), page, "label", conf(r, 0.8)); consumed.add(i); continue; }

    if ((r = pick(L.firstName))) { take("first_name", found(r.v, page, "label", conf(r))); consumed.add(i); continue; }
    if ((r = pick(L.lastName))) { take("last_name", found(r.v, page, "label", conf(r))); consumed.add(i); continue; }
    if ((r = pick(L.email))) {
      const m = r.v.match(EMAIL_RE);
      take("email", m ? found(m[0].toLowerCase(), page, "label", conf(r, 0.95)) : found(r.v, page, "label", 0.4, ["not_an_email"]));
      consumed.add(i); continue;
    }
    if ((r = pick(L.phone))) { take("phone", found(r.v, page, "label", conf(r))); consumed.add(i); continue; }
    if ((r = pick(L.dob))) { take("date_of_birth", found(r.v, page, "label", conf(r))); consumed.add(i); continue; }
    if ((r = pick(L.address))) {
      // An address may continue on following lines until the next label/blank.
      let v = r.v; let j = i + (r.nextLine ? 2 : 1);
      while (j < lines.length && lines[j].page === page && !isAnyLabel(lines[j].text) && !isQuestion(lines[j].text) && j - i < 4) {
        v += ", " + lines[j].text; consumed.add(j); j++;
      }
      take("address", found(v, page, "label", conf(r, 0.9)));
      const st = v.match(ADDRESS_STATE_RE);
      if (st && normaliseState(st[1])) take("state", found(normaliseState(st[1])!, page, "inferred", 0.7, ["inferred_from_address"]));
      consumed.add(i); continue;
    }
    if ((r = pick(L.state))) {
      const code = normaliseState(r.v);
      take("state", code ? found(code, page, "label", conf(r)) : found(r.v, page, "label", 0.3, ["unrecognised_state"]));
      consumed.add(i); continue;
    }
    if ((r = pick(L.service))) {
      const ev = serviceEvidence(r.v);
      if (ev.esa > 0 && ev.psd === 0) take("service", found("esa", page, "label", conf(r, 0.95)));
      else if (ev.psd > 0 && ev.esa === 0) take("service", found("psd", page, "label", conf(r, 0.95)));
      else if (ev.esa > 0 && ev.psd > 0) { take("service", { value: null, page, method: "label", confidence: 0, warnings: ["service_conflict"] }); warnings.push("service_conflict"); }
      else take("service", { value: null, page, method: "label", confidence: 0, warnings: ["service_unrecognised"] });
      consumed.add(i); continue;
    }
    if ((r = pick(L.petCount))) {
      const n = r.v.match(/\d+/);
      if (n) take("pet_count", found(n[0], page, "label", conf(r)));
      consumed.add(i); continue;
    }
    if ((r = pick(L.paymentRef))) { take("payment_reference", found(r.v, page, "label", conf(r))); consumed.add(i); continue; }
    if ((r = pick(L.paidStatus))) {
      const v = r.v.toLowerCase();
      if (/\b(paid|complete|completed|succeeded|success|captured|settled)\b/.test(v) && !/\b(un|not)\s*paid|pending|failed|refunded\b/.test(v)) take("paid_status", found("paid", page, "label", conf(r)));
      else take("paid_status", found(v, page, "label", 0.5, ["not_confirmed_paid"]));
      consumed.add(i); continue;
    }
    if ((r = pick(L.orderId))) {
      // A reference must carry a digit: "Order Receipt" / "Order Confirmation"
      // are document titles, not identifiers.
      const ref = r.v.replace(/\s+/g, "");
      if (/\d/.test(ref)) take("external_order_id", found(ref, page, "label", conf(r)));
      consumed.add(i); continue;
    }
    if ((r = pick(L.orderDate))) { const d = r.v.match(DATE_RE); if (d) take("order_date", found(d[0], page, "label", conf(r))); consumed.add(i); continue; }
    if ((r = pick(L.fullName))) {
      const parts = r.v.split(/\s+/);
      if (parts.length >= 2) {
        take("first_name", found(parts.slice(0, -1).join(" "), page, "inferred", 0.65, ["split_from_full_name"]));
        take("last_name", found(parts[parts.length - 1], page, "inferred", 0.65, ["split_from_full_name"]));
      } else take("first_name", found(r.v, page, "inferred", 0.4, ["single_word_name"]));
      consumed.add(i); continue;
    }
    if ((r = pick(L.consultation))) { take("consultation", found(r.v, page, "label", conf(r, 0.8))); consumed.add(i); continue; }
    if ((r = pick(L.notes))) { take("notes", found(r.v, page, "label", conf(r, 0.8))); consumed.add(i); continue; }
  }

  // ── Pass 2: pattern fallbacks (never override a labelled value) ───────────
  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    const { page, text } = lines[i];
    if (f.email.value === null) { const m = text.match(EMAIL_RE); if (m) take("email", found(m[0].toLowerCase(), page, "pattern", 0.7, ["unlabelled"])); }
    if (f.phone.value === null) { const m = text.match(PHONE_RE); if (m && !/\d{5,}[-\s]?\d{4,}/.test(text.replace(m[0], ""))) take("phone", found(m[0], page, "pattern", 0.6, ["unlabelled"])); }
  }

  // ── Pass 3: service family from document-wide evidence (fail closed) ──────
  if (f.service.value === null && !f.service.warnings.includes("service_conflict")) {
    const total = { esa: 0, psd: 0 };
    let firstPage: number | null = null;
    for (const l of lines) {
      const ev = serviceEvidence(l.text);
      if ((ev.esa || ev.psd) && firstPage === null) firstPage = l.page;
      total.esa += ev.esa; total.psd += ev.psd;
    }
    if (total.esa > 0 && total.psd === 0) take("service", found("esa", firstPage ?? 1, "inferred", 0.6, ["inferred_from_document"]));
    else if (total.psd > 0 && total.esa === 0) take("service", found("psd", firstPage ?? 1, "inferred", 0.6, ["inferred_from_document"]));
    else if (total.esa > 0 && total.psd > 0) {
      f.service = { value: null, page: firstPage, method: "inferred", confidence: 0, warnings: ["service_conflict"] };
      warnings.push("service_conflict");
    }
  }

  // ── Pass 4: question / answer pairs ───────────────────────────────────────
  for (let i = 0; i < lines.length; i++) {
    const { page, text } = lines[i];
    let question: string | null = null;
    let inlineAnswer: string | null = null;
    const qa1 = text.match(/^(?:q(?:uestion)?\s*\d*\s*[:.)-]\s*)(.+?)(?:\s+a(?:nswer)?\s*[:.)-]\s*(.+))?$/i);
    if (qa1) { question = qa1[1].trim(); inlineAnswer = qa1[2]?.trim() ?? null; }
    else if (isQuestion(text)) {
      question = text;
    } else {
      const q2 = text.match(/^(.+\?)\s+(.+)$/);
      if (q2 && q2[1].length >= 8) { question = q2[1].trim(); inlineAnswer = q2[2].trim(); }
    }
    if (!question) continue;
    if (inlineAnswer) { qa.push({ question, answer: inlineAnswer, page, confidence: 0.8 }); continue; }
    // Answer = following lines on the same page until the next question/label.
    const parts: string[] = [];
    let j = i + 1;
    while (j < lines.length && lines[j].page === page && parts.length < 6) {
      const t = lines[j].text;
      if (isQuestion(t) || /^q(uestion)?\s*\d*\s*[:.)-]/i.test(t) || (isAnyLabel(t) && !/^a(nswer)?\s*[:.)-]/i.test(t))) break;
      parts.push(t.replace(/^a(nswer)?\s*[:.)-]\s*/i, ""));
      j++;
    }
    if (parts.length) qa.push({ question, answer: parts.join("\n"), page, confidence: parts.length === 1 ? 0.75 : 0.6 });
    else qa.push({ question, answer: "", page, confidence: 0.2 });
  }

  // ── Consistency warnings ──────────────────────────────────────────────────
  if (f.pet_count.value !== null && pets.length > 0 && Number(f.pet_count.value) !== pets.length) {
    warnings.push("pet_count_mismatch");
    f.pet_count.warnings.push("pet_count_mismatch");
  }
  if (f.pet_count.value === null && pets.length > 0) f.pet_count = found(String(pets.length), pets[0].name.page ?? 1, "inferred", 0.6, ["counted_pet_blocks"]);
  if (pets.length === 0) warnings.push("no_pets_found");
  if (charCount < 40) warnings.push("no_text_layer");
  for (const key of INTAKE_FIELD_KEYS) {
    if (f[key].value !== null && f[key].confidence < REVIEW_THRESHOLD && !f[key].warnings.includes("low_confidence")) f[key].warnings.push("low_confidence");
  }

  return { fields: f, pets, qa, warnings: Array.from(new Set(warnings)), charCount };
}

/** Stable, human-readable answer key for a free-text question. */
export function questionKey(question: string): string {
  const slug = question.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 100);
  return slug ? `q_${slug}` : "q_unlabelled";
}
