// scripts/check-admin-order-customer-pet-editing.mjs
//
// ADMIN-ORDER-CUSTOMER-PET-EDITING-LIVE-001 — guard (LIVE).
//
// An admin can correct the customer's first name, last name and state, and the
// order's canonical pet rows, from the Order Details modal — on any order,
// completed ones included. That is a lot of authority pointed at the row that
// drives letters, providers and money, so the rules below are the ones that
// must never quietly regress.
//
//   A  Admin authorisation is checked INSIDE the function, not implied by a grant.
//   B  One atomic mutation: lock the row, validate, write once, verify the row.
//   C  The 1-3 pet limit is applied to the EFFECTIVE total (originals + approved
//      add-ons), never to the array alone.
//   D  Entitlement comes from the purchased snapshot, never today's price.
//   E  Growth beyond the purchased entitlement needs an authoritative PAID
//      invoice; a PaymentIntent, an open/void/failed/expired invoice or an
//      amount alone never qualifies.
//   F  A payment record can authorise exactly one pet, ever (UNIQUE, not code).
//   G  State is normalised to a canonical 2-letter code or refused.
//   H  Provider licensing is READ for compatibility and never written.
//   I  A completed order's issued PDF, its versions and its verification
//      history are untouched; the reissue goes through the ESTABLISHED
//      reopen transition and creates no second main document.
//   J  A correction reason is required, and every commit writes a BEFORE/AFTER
//      audit row. A failed attempt writes nothing.
//   K  Attribution, payment history, paid_at, confirmation_id and email are
//      never in the write set.
//   L  The frozen OrderDetailModal gets a mount and nothing else.
//
// Static assertions only — no runtime, no network, no DB. The behavioural
// counterpart (the RPC actually refusing on a real database) is proven by the
// rollback-contained fixture matrix recorded in the task report.
//
// Usage:
//   node scripts/check-admin-order-customer-pet-editing.mjs             → guard
//   node scripts/check-admin-order-customer-pet-editing.mjs --warn-only → audit
//   node scripts/check-admin-order-customer-pet-editing.mjs --self-test → controls

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WARN = process.argv.includes("--warn-only");
const SELF = process.argv.includes("--self-test");

const F = {
  mig: "supabase/migrations/20260828120000_admin_order_customer_pet_editing.sql",
  live: "supabase/migrations/20260829090000_admin_order_customer_pet_editing_preserve_unknown_pet_fields.sql",
  step2: "src/pages/assessment/components/Step2PersonalInfo.tsx",
  ui: "src/pages/admin-orders/components/OrderCustomerPetsMenuAction.tsx",
  modal: "src/pages/admin-orders/components/OrderDetailModal.tsx",
  cpr: "supabase/functions/create-custom-payment-request/index.ts",
};

function read(key, override) {
  if (override && override[key] !== undefined) return override[key];
  const p = resolve(ROOT, F[key]);
  if (!existsSync(p)) throw new Error(`missing file: ${F[key]}`);
  // CRLF normalised at the SINGLE read point so multi-line anchors and ordering
  // comparisons behave identically on Windows and CI.
  return readFileSync(p, "utf8").replace(/\r\n/g, "\n");
}

/** SQL with comments stripped, so a check can never be satisfied — or tripped —
 *  by the prose documenting the very rule it enforces. String literals are KEPT:
 *  here the load-bearing artefacts ARE literals (status values, column names,
 *  the operator-facing messages). */
function sqlCode(src) {
  return src.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
}

/** Comment-free view of TS/TSX with real string-context tracking, so a "must
 *  NOT contain" scan tests the USE of an identifier, never its mention in a
 *  comment. */
function codeOnly(src) {
  let out = ""; let i = 0; const n = src.length;
  let state = 0; const td = [];
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (state === 0) {
      if (c === "/" && d === "/") { state = 1; i += 2; continue; }
      if (c === "/" && d === "*") { state = 2; i += 2; continue; }
      if (c === "'") { state = 3; out += c; i++; continue; }
      if (c === '"') { state = 4; out += c; i++; continue; }
      if (c === "`") { state = 5; out += c; i++; continue; }
      if (c === "}" && td.length) {
        if (td[td.length - 1] === 0) { td.pop(); state = 5; out += c; i++; continue; }
        td[td.length - 1]--;
      }
      if (c === "{" && td.length) td[td.length - 1]++;
      out += c; i++; continue;
    }
    if (state === 1) { if (c === "\n") { state = 0; out += "\n"; } i++; continue; }
    if (state === 2) { if (c === "*" && d === "/") { state = 0; i += 2; } else { if (c === "\n") out += "\n"; i++; } continue; }
    if (state === 3) { if (c === "\\") { out += src.slice(i, i + 2); i += 2; continue; } if (c === "'") state = 0; out += c; i++; continue; }
    if (state === 4) { if (c === "\\") { out += src.slice(i, i + 2); i += 2; continue; } if (c === '"') state = 0; out += c; i++; continue; }
    if (state === 5) {
      if (c === "\\") { out += src.slice(i, i + 2); i += 2; continue; }
      if (c === "`") { state = 0; out += c; i++; continue; }
      if (c === "$" && d === "{") { td.push(0); state = 0; out += "${"; i += 2; continue; }
      out += c; i++; continue;
    }
  }
  return out;
}

/** Extract a dollar-quoted function body by name. */
function fnBody(sql, fn) {
  const re = new RegExp("create\\s+or\\s+replace\\s+function\\s+public\\." + fn + "\\s*\\(", "i");
  const m = re.exec(sql);
  if (!m) return "";
  const dq = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/g;
  dq.lastIndex = m.index;
  const open = dq.exec(sql);
  if (!open) return "";
  const end = sql.indexOf(open[0], open.index + open[0].length);
  return end < 0 ? "" : sql.slice(open.index + open[0].length, end);
}

/** Every brace-balanced object literal that follows `label` in `src`. A plain
 *  `\{[^}]*\}` regex stops at the first inner `}`, which would silently miss a
 *  spread like `{ ...(x ? { x } : {}), y }` — exactly the shape under test. */
function braceObjects(src, label) {
  const out = [];
  let i = 0;
  while ((i = src.indexOf(label, i)) !== -1) {
    let j = src.indexOf("{", i);
    if (j < 0) break;
    let depth = 0;
    let k = j;
    for (; k < src.length; k += 1) {
      if (src[k] === "{") depth += 1;
      else if (src[k] === "}") { depth -= 1; if (depth === 0) break; }
    }
    if (depth === 0) out.push(src.slice(j, k + 1));
    i += label.length;
  }
  return out;
}

const mutation = (s) => sqlCode(fnBody(s.mig, "admin_update_order_customer_and_pets"));

/** The single UPDATE public.orders SET block the mutation performs. */
function updateBlock(s) {
  const b = mutation(s);
  const a = b.indexOf("update public.orders");
  if (a < 0) throw new Error("anchor missing: update public.orders");
  const e = b.indexOf("returning * into v_order", a);
  if (e < 0) throw new Error("anchor missing: returning * into v_order");
  return b.slice(a, e);
}

// Columns that must NEVER appear in the mutation's write set. Attribution and
// acquisition, money and its timestamps, identity keys.
const FORBIDDEN_WRITE_COLUMNS = [
  "gclid", "gbraid", "wbraid", "fbclid", "msclkid",
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "attribution_json", "first_touch_json", "last_touch_json", "landing_url",
  "session_id", "referred_by", "source_system",
  "price", "coupon_code", "coupon_discount", "paid_at", "last_payment_at",
  "payment_intent_id", "checkout_session_id", "subscription_id",
  "refund_amount", "refunded_at", "refund_status",
  "stripe_gross_charged_cents", "stripe_refunded_cents", "stripe_net_retained_cents",
  "confirmation_id", "email", "user_id",
  "google_ads_upload_status", "meta_capi_status", "microsoft_ads_upload_status",
];

const CHECKS = [
  // ── A · admin authorisation ───────────────────────────────────────────────
  ["A1", "the mutation checks is_admin_staff() inside the function body",
    (s) => /if\s+not\s+public\.is_admin_staff\(\)\s+then/.test(mutation(s))
        && /insufficient_privilege/.test(mutation(s))],
  ["A2", "the authorisation check is the FIRST thing the mutation does",
    (s) => {
      const b = mutation(s);
      return b.indexOf("is_admin_staff()") < b.indexOf("select * into v_order");
    }],
  ["A3", "the read model is admin-gated too",
    (s) => /if\s+not\s+public\.is_admin_staff\(\)\s+then/
      .test(sqlCode(fnBody(s.mig, "admin_order_customer_pet_edit_state")))],
  ["A4", "anon can execute neither admin entry point",
    (s) => {
      const c = sqlCode(s.mig);
      return /revoke all on function public\.admin_update_order_customer_and_pets\([^)]*\)\s*\n?\s*from public, anon, authenticated/.test(c)
          && /revoke all on function public\.admin_order_customer_pet_edit_state\(uuid\)\s+from public, anon, authenticated/.test(c)
          && !/grant execute on function public\.[a-z_]+\([^)]*\) to anon/.test(c);
    }],
  ["A5", "both admin functions are SECURITY DEFINER with a pinned search_path",
    (s) => {
      const c = sqlCode(s.mig);
      for (const fn of ["admin_update_order_customer_and_pets", "admin_order_customer_pet_edit_state"]) {
        const i = c.indexOf(`create or replace function public.${fn}`);
        if (i < 0) return false;
        const head = c.slice(i, c.indexOf("as $function$", i));
        if (!/security definer/.test(head)) return false;
        if (!/set search_path to 'public', 'pg_temp'/.test(head)) return false;
      }
      return true;
    }],
  ["A6", "the ledger tables have RLS on and are never granted to a browser role",
    (s) => {
      const c = sqlCode(s.mig);
      return /alter table public\.order_customer_pet_corrections\s+enable row level security/.test(c)
          && /alter table public\.order_pet_correction_authorizations enable row level security/.test(c)
          && /revoke all on public\.order_customer_pet_corrections\s+from public, anon, authenticated/.test(c)
          && /revoke all on public\.order_pet_correction_authorizations from public, anon, authenticated/.test(c)
          && !/create policy[\s\S]*on public\.order_customer_pet_corrections/.test(c)
          && !/create policy[\s\S]*on public\.order_pet_correction_authorizations/.test(c);
    }],

  // ── B · atomicity and returned-row verification ───────────────────────────
  ["B1", "the order row is locked before anything is validated or written",
    (s) => {
      const b = mutation(s);
      const lock = b.indexOf("for update");
      return lock > 0 && lock < b.indexOf("update public.orders");
    }],
  ["B2", "there is exactly ONE update of public.orders in the mutation",
    (s) => (mutation(s).match(/update public\.orders/g) || []).length === 1],
  ["B3", "the write is verified: exactly one row, or it raises",
    (s) => {
      const b = mutation(s);
      return /get diagnostics v_rows = row_count;/.test(b)
          && /if v_rows <> 1 or v_order\.id is null then/.test(b)
          && /raise exception 'admin_update_order_customer_and_pets: expected exactly 1 updated row/.test(b);
      }],
  ["B4", "the committed row is returned to the caller, not the requested one",
    (s) => {
      const b = mutation(s);
      return /returning \* into v_order/.test(b)
          && /'first_name', v_order\.first_name/.test(b.slice(b.indexOf("v_result :=")));
    }],
  ["B5", "a repeated request replays the stored snapshot instead of re-applying",
    (s) => {
      const b = mutation(s);
      const replay = b.indexOf("where idempotency_key = btrim(p_idempotency_key)");
      return replay > 0 && replay < b.indexOf("update public.orders")
          && /return v_replay\.result \|\| jsonb_build_object\('replayed', true\)/.test(b);
    }],
  ["B6", "idempotency is enforced by a UNIQUE constraint, not by the read",
    (s) => /constraint uq_order_customer_pet_corrections_idem unique \(idempotency_key\)/.test(sqlCode(s.mig))],
  ["B7", "a stale edit is refused rather than applied",
    (s) => /btrim\(p_expected_fingerprint\) <> v_fp_before then/.test(mutation(s))],
  // Found on hosted TEST: raising 40001 (class 40, transaction rollback) made the
  // connection pooler RETRY the refusal instead of returning it, so the request
  // never settled and the operator sat on a permanent "Saving…".
  ["B7b", "no refusal is raised with a RETRYABLE sqlstate",
    (s) => {
      const b = mutation(s);
      return !/serialization_failure/.test(b)
          && !/deadlock_detected/.test(b)
          && !/errcode = '40/.test(b);
    }],

  // ── C · the 1-3 pet limit ─────────────────────────────────────────────────
  ["C1", "at least one pet must remain",
    (s) => /if v_count_after < 1 then[\s\S]{0,200}raise exception 'An order must keep at least one pet\.'/.test(mutation(s))],
  ["C2", "the ceiling comes from additional_pet_max_total(), not a literal 3",
    (s) => /v_max\s+integer := public\.additional_pet_max_total\(\)/.test(mutation(s))],
  ["C3", "the ceiling is applied to the EFFECTIVE total, not the array alone",
    (s) => {
      const b = mutation(s);
      return /v_added := coalesce\(\(public\.additional_pet_effective_state\(p_order_id\) ->> 'approved_added'\)::int, 0\)/.test(b)
          && /if v_count_after \+ v_added > v_max then/.test(b);
    }],
  // LIVE: step1/PetSection.ts is TEST-ONLY and was never promoted. The editor
  // must not import it, must not vendor a copy of it, and must take the ceiling
  // from the server rather than a constant of its own.
  ["C4", "the LIVE editor never depends on TEST-only step1/PetSection",
    (s) => {
      const c = codeOnly(s.ui);
      return !/step1\/PetSection/.test(c)
          && !/PET_TYPE_OPTIONS/.test(c)
          && !existsSync(resolve(ROOT, "src/pages/assessment/components/step1/PetSection.ts"));
    }],
  ["C4b", "the pet ceiling comes from the SERVER read model, not a UI constant",
    (s) => {
      const c = codeOnly(s.ui);
      return /const maxPets = state\?\.max_total_pets/.test(c)
          && !/const MAX_PETS\s*=/.test(c)
          && !/pets\.length >= 3/.test(c)
          && !/maxPets = 3/.test(c);
    }],
  ["C4c", "animal types come from LIVE's own intake list, exported not duplicated",
    (s) => {
      const c = codeOnly(s.ui);
      return /import \{ PET_TYPES \} from "\.\.\/\.\.\/assessment\/components\/Step2PersonalInfo"/.test(c)
          && !/const PET_TYPES\s*=\s*\[/.test(c)
          && /export const PET_TYPES = \["Dog", "Cat", "Bird", "Rabbit", "Hamster", "Guinea Pig", "Other"\];/
               .test(codeOnly(s.step2));
    }],

  // ── D · entitlement from the purchased snapshot ───────────────────────────
  ["D1", "entitlement is read from order_entitlement_snapshots.purchased_pet_limit",
    (s) => {
      const b = mutation(s);
      return /select \* into v_snap from public\.order_entitlement_snapshots where order_id = p_order_id/.test(b)
          && /v_limit\s+:= v_snap\.purchased_pet_limit/.test(b);
    }],
  ["D2", "no current marketing price is consulted anywhere in the mutation",
    (s) => !/(getEsaOneTimeTotal|getPackageTotal|STANDARD_MATRIX|orders\.price|additional_pet_current_price|129|149)/
      .test(mutation(s))],
  ["D3", "an order already holding more pets than it purchased stays correctable",
    (s) => /v_covered := greatest\(coalesce\(v_limit, 0\), v_count_before\)/.test(mutation(s))],
  ["D4", "only growth PAST the covered count needs authorisation",
    (s) => /v_growth\s+:= greatest\(0, v_count_after - v_covered\)/.test(mutation(s))],
  ["D5", "a missing snapshot fails CLOSED (no growth without payment)",
    (s) => {
      // coalesce(v_limit, 0) means an unknown entitlement contributes nothing,
      // so covered collapses to the current count and any growth needs payment.
      const b = mutation(s);
      return /coalesce\(v_limit, 0\)/.test(b) && !/coalesce\(v_limit, 3\)/.test(b);
    }],

  // ── E · paid-invoice requirement ──────────────────────────────────────────
  ["E1", "only status='paid' with a real paid_at qualifies",
    (s) => {
      const b = sqlCode(fnBody(s.mig, "available_additional_pet_authorizations"));
      return /and r\.status\s+= 'paid'/.test(b) && /and r\.paid_at is not null/.test(b);
    }],
  ["E2", "unpaid / open / void / expired / failed states never qualify",
    (s) => {
      const b = sqlCode(fnBody(s.mig, "available_additional_pet_authorizations"));
      return !/'open'/.test(b) && !/'void'/.test(b) && !/'expired'/.test(b)
          && !/'failed'/.test(b) && !/'draft'/.test(b) && !/'creating'/.test(b)
          && !/'partially_refunded'/.test(b);
    }],
  ["E3", "a refunded invoice never qualifies",
    (s) => /coalesce\(r\.refunded_amount_cents, 0\) = 0/
      .test(sqlCode(fnBody(s.mig, "available_additional_pet_authorizations")))],
  ["E4", "payment is never inferred from a PaymentIntent or from an amount",
    (s) => {
      const b = sqlCode(fnBody(s.mig, "available_additional_pet_authorizations"));
      return !/stripe_payment_intent_id/.test(b) && !/amount_cents\s*[<>=]/.test(b);
    }],
  ["E5", "the invoice must declare WHAT it authorises",
    (s) => /r\.metadata ->> 'authorizes' = 'additional_pet'/
      .test(sqlCode(fnBody(s.mig, "available_additional_pet_authorizations")))],
  ["E6", "a shortfall raises the owner's exact message and commits nothing",
    (s) => {
      const b = mutation(s);
      const i = b.indexOf("if coalesce(array_length(v_auth_ids, 1), 0) < v_growth then");
      return i > 0 && i < b.indexOf("update public.orders")
          && /raise exception 'Additional payment required\. Send a custom Additional Pet invoice and wait for payment before adding this pet\.'/.test(b);
    }],
  ["E7", "the UI shows that same message verbatim",
    (s) => /Additional payment required\. Send a custom Additional Pet invoice and wait for payment before adding this pet\./
      .test(s.ui)],
  ["E8", "the custom-invoice function accepts a CLOSED set of authorises values",
    (s) => {
      const c = codeOnly(s.cpr);
      return /const VALID_AUTHORIZES = \["additional_pet"\] as const;/.test(c)
          && /if \(authorizes && !VALID_AUTHORIZES\.includes\(/.test(c)
          && /metadata: authorizes \? \{ authorizes \} : null,/.test(c);
    }],
  ["E8b", "the authorises label survives every later metadata write",
    (s) => {
      const c = codeOnly(s.cpr);
      // `metadata` is a whole-column write: any later update that lists only its
      // own keys ERASES the label, and a paid invoice silently stops qualifying.
      const writes = braceObjects(c, "metadata:")
        .filter((w) => /stripe_invoice_number|stripe_error/.test(w));
      return writes.length >= 2 && writes.every((w) => /\.\.\.\(authorizes \? \{ authorizes \} : \{\}\)/.test(w));
    }],
  ["E9", "no additional-pet price is hard-coded in the UI",
    (s) => {
      const c = codeOnly(s.ui);
      return !/amountCents:\s*\d/.test(c) && /amountCents: Math\.round\(dollars \* 100\)/.test(c);
    }],
  ["E10", "the prefilled invoice reuses the EXISTING custom-invoice purpose",
    (s) => {
      const c = codeOnly(s.ui);
      return /purpose: "supplemental_charge"/.test(c)
          && /authorizes: "additional_pet"/.test(c)
          && /functions\/v1\/create-custom-payment-request/.test(c);
    }],

  // ── F · single-use consumption ────────────────────────────────────────────
  ["F1", "reuse is prevented by a UNIQUE constraint, not by a query",
    (s) => /constraint uq_pet_correction_auth_request unique \(custom_payment_request_id\)/.test(sqlCode(s.mig))],
  ["F2", "an already-consumed invoice is excluded from the available list",
    (s) => /not exists \(\s*select 1 from public\.order_pet_correction_authorizations a\s*where a\.custom_payment_request_id = r\.id\s*\)/
      .test(sqlCode(fnBody(s.mig, "available_additional_pet_authorizations")).replace(/\s+/g, " ")
        .replace(/not exists \( select 1 from public\.order_pet_correction_authorizations a where a\.custom_payment_request_id = r\.id \)/, "not exists (\n select 1 from public.order_pet_correction_authorizations a\n where a.custom_payment_request_id = r.id\n )"))
      || /not exists \( select 1 from public\.order_pet_correction_authorizations a where a\.custom_payment_request_id = r\.id \)/
        .test(sqlCode(fnBody(s.mig, "available_additional_pet_authorizations")).replace(/\s+/g, " "))],
  ["F3", "consumption is recorded in the same transaction as the write",
    (s) => {
      const b = mutation(s);
      const ins = b.indexOf("insert into public.order_pet_correction_authorizations");
      return ins > b.indexOf("update public.orders") && ins > 0;
    }],
  ["F4", "an APPROVED add-on request can never double as growth authorisation",
    (s) => !/order_additional_pet_requests/.test(sqlCode(fnBody(s.mig, "available_additional_pet_authorizations")))],

  // ── G · state normalisation ───────────────────────────────────────────────
  ["G1", "the stored state is the normaliser's output, never the raw input",
    (s) => {
      const b = mutation(s);
      return /v_state := public\.normalize_us_state_code\(p_state\)/.test(b)
          && /state\s+= v_state,/.test(updateBlock(s))
          && !/state\s+= p_state/.test(updateBlock(s));
    }],
  ["G2", "an unrecognised state is refused, not stored",
    (s) => /if v_state is null then[\s\S]{0,160}raise exception 'Enter a valid US state\.'/.test(mutation(s))],
  ["G3", "the normaliser returns NULL for an unknown value rather than guessing",
    (s) => {
      const b = sqlCode(fnBody(s.mig, "normalize_us_state_code"));
      return /return null;\s*end;\s*$/.test(b.trimEnd())
          && /'district of columbia'/.test(b);
    }],

  // ── H · provider/state compatibility ──────────────────────────────────────
  ["H1", "compatibility is evaluated server-side on a state change",
    (s) => /v_prov_ok := public\.provider_licensed_in_state\(v_order\.doctor_user_id, v_state\)/.test(mutation(s))],
  ["H2", "an ineligible provider requires an explicit admin confirmation",
    (s) => /if coalesce\(\(v_confirm ->> 'provider_reassignment'\)::boolean, false\) is not true then/.test(mutation(s))],
  ["H3", "an ineligible provider is UNASSIGNED into the established queue",
    (s) => {
      const u = updateBlock(s);
      return /doctor_user_id\s+= case when v_unassign then null else doctor_user_id end/.test(u)
          && /doctor_status\s+= case when v_unassign then 'unassigned' else doctor_status end/.test(u);
    }],
  ["H4", "no replacement provider is ever chosen automatically",
    (s) => {
      const b = mutation(s);
      return !/order by[\s\S]{0,80}doctor_profiles/.test(b)
          && !/doctor_user_id\s*=\s*\(select/.test(b);
    }],
  ["H5", "licensing records are read, never written",
    (s) => {
      const c = sqlCode(s.mig);
      return !/update public\.doctor_profiles/.test(c)
          && !/update public\.doctor_contacts/.test(c)
          && !/insert into public\.doctor_profiles/.test(c)
          && !/insert into public\.doctor_contacts/.test(c);
    }],
  ["H6", "an order with no provider is corrected without a licensing block",
    (s) => /if v_state_changed and v_order\.doctor_user_id is not null then/.test(mutation(s))],

  // ── I · completed orders and document safety ──────────────────────────────
  ["I1", "the mutation never writes to any document or verification table",
    (s) => {
      const c = sqlCode(s.mig);
      for (const t of ["order_documents", "order_document_versions", "letter_verifications"]) {
        if (new RegExp(`(update|insert into|delete from)\\s+public\\.${t}`).test(c)) return false;
      }
      return true;
    }],
  ["I2", "no document is superseded, activated or deleted by the correction",
    (s) => {
      const c = sqlCode(s.mig);
      return !/superseded_by_document_id\s*=/.test(c)
          && !/superseded_at\s*=\s*now\(\)/.test(c)
          && !/is_active\s*=\s*false/.test(c);
    }],
  ["I3", "the reissue uses the ESTABLISHED transition, not a new status",
    (s) => {
      const b = mutation(s);
      return /v_reopen := public\.reopen_order_under_review\(/.test(b)
          && !/set status\s*=\s*'/.test(updateBlock(s));
    }],
  ["I4", "reissue requires an explicit admin confirmation",
    (s) => /if coalesce\(\(v_confirm ->> 'document_reissue'\)::boolean, false\) is not true then/.test(mutation(s))],
  ["I5", "an issued main letter is detected from approved/delivered, unsuperseded rows",
    (s) => {
      const b = mutation(s).replace(/\s+/g, " ");
      return /d\.doc_type in \('esa_letter', 'psd_letter'\)/.test(b)
          && /d\.superseded_at is null/.test(b)
          && /d\.delivered_at is not null or d\.approved_at is not null/.test(b);
    }],
  ["I6", "Additional Documentation and customer uploads are NOT treated as the letter",
    (s) => {
      const b = mutation(s);
      return !/'customer_upload'/.test(b) && !/additional_documentation_status/.test(b);
    }],
  ["I7", "editing a completed order requires its own confirmation",
    (s) => /if v_completed and coalesce\(\(v_confirm ->> 'completed_order'\)::boolean, false\) is not true then/.test(mutation(s))],
  ["I8", "the UI never claims the correction changed an existing PDF",
    (s) => /The existing letter and its verification history are preserved untouched/.test(s.ui)],

  // ── J · reason and audit ──────────────────────────────────────────────────
  ["J1", "a correction reason is required and validated by the EXISTING validator",
    (s) => /v_reason := public\.validate_reopen_reason\(p_reason\)/.test(mutation(s))],
  ["J2", "the reason is validated BEFORE anything is written",
    (s) => {
      const b = mutation(s);
      return b.indexOf("validate_reopen_reason") < b.indexOf("update public.orders");
    }],
  ["J3", "the audit row carries BOTH before and after values",
    (s) => {
      const b = mutation(s);
      const i = b.indexOf("insert into public.audit_logs");
      const seg = b.slice(i);
      return /'first_name', v_prior\.first_name/.test(seg)
          && /'pets', v_pets_before/.test(seg)
          && /'first_name', v_order\.first_name/.test(seg)
          && /'pets', v_pets_after/.test(seg);
    }],
  ["J4", "the audit row records the required correction facts",
    (s) => {
      const seg = mutation(s).slice(mutation(s).indexOf("insert into public.audit_logs"));
      for (const k of ["'confirmation_id'", "'order_id'", "'reason'", "'name_changed'",
        "'state_changed'", "'prior_pet_count'", "'new_pet_count'", "'pets_added'",
        "'pets_removed'", "'payment_authorizations_used'",
        "'provider_reassignment_required'", "'document_reissue_required'"]) {
        if (!seg.includes(k)) return false;
      }
      return /'source', 'Admin Order Details'/.test(seg);
    }],
  // Found on the real database: `text[] || 'literal'` resolves to
  // anyarray || anyarray, so the operator saw "malformed array literal: state"
  // instead of the reason they had to confirm. The gate still failed closed,
  // but the message was unusable.
  ["J4b", "the confirmation list is built with array_append, never || 'literal'",
    (s) => {
      const b = mutation(s);
      return (b.match(/v_needed := array_append\(v_needed, '/g) || []).length === 5
          && !/v_needed := v_needed \|\|/.test(b)
          && !/v_auth_ids := v_auth_ids \|\|/.test(b);
    }],
  ["J5", "the audit actor comes from the JWT, never from a parameter",
    (s) => {
      const b = mutation(s);
      return /v_actor\s+uuid := auth\.uid\(\)/.test(b)
          && /select display_name, role into v_name, v_role from public\.current_staff_actor\(\)/.test(b)
          && !/p_actor/.test(b);
    }],
  ["J6", "the audit row is written only AFTER the row-count verification",
    (s) => {
      const b = mutation(s);
      return b.indexOf("get diagnostics v_rows") < b.indexOf("insert into public.audit_logs");
    }],
  ["J7", "no card data, invoice URL or clinical answer is copied into the audit",
    (s) => {
      const seg = mutation(s).slice(mutation(s).indexOf("insert into public.audit_logs"));
      return !/hosted_url/.test(seg) && !/stripe_invoice_id/.test(seg)
          && !/assessment_answers/.test(seg) && !/internal_note/.test(seg);
    }],
  ["J8", "the UI requires a reason before Save can be pressed",
    (s) => {
      const c = codeOnly(s.ui);
      return /const reasonValid = isCorrectionReasonValid\(reason\)/.test(c)
          && /const canSave = [\s\S]{0,400}&& reasonValid/.test(c);
    }],

  // ── K · protected systems ─────────────────────────────────────────────────
  ["K1", "no attribution, money or identity column is in the write set",
    (s) => {
      const u = updateBlock(s);
      return FORBIDDEN_WRITE_COLUMNS.every((c) => !new RegExp(`(^|[\\s,])${c}\\s*=`, "m").test(u));
    }],
  ["K2", "the write set is exactly the fields this editor owns",
    (s) => {
      const u = updateBlock(s);
      const assigned = [...u.matchAll(/(?:set|,)\s+([a-z_]+)\s+=/g)].map((m) => m[1]);
      const allowed = new Set(["first_name", "last_name", "state", "assessment_answers",
        "doctor_user_id", "doctor_email", "doctor_name", "selected_provider", "doctor_status"]);
      return assigned.length > 0 && assigned.every((a) => allowed.has(a));
    }],
  ["K3", "only the pets key of assessment_answers is replaced",
    (s) => /assessment_answers = jsonb_set\(\s*coalesce\(assessment_answers, '\{\}'::jsonb\),\s*'\{pets\}', v_pets_after, true\)/
      .test(updateBlock(s).replace(/\s+/g, " ")
        .replace(/assessment_answers = jsonb_set\( coalesce\(assessment_answers, '\{\}'::jsonb\), '\{pets\}', v_pets_after, true\)/,
          "assessment_answers = jsonb_set(\n coalesce(assessment_answers, '{}'::jsonb),\n '{pets}', v_pets_after, true)"))
      || /assessment_answers = jsonb_set\( coalesce\(assessment_answers, '\{\}'::jsonb\), '\{pets\}', v_pets_after, true\)/
        .test(updateBlock(s).replace(/\s+/g, " "))],
  ["K4", "no payment-history table is written by the migration",
    (s) => {
      const c = sqlCode(s.mig);
      for (const t of ["payment_attempts", "order_price_quotes", "order_entitlement_snapshots",
        "order_additional_pet_requests", "doctor_earnings"]) {
        if (new RegExp(`(update|insert into|delete from)\\s+public\\.${t}`).test(c)) return false;
      }
      return true;
    }],
  ["K5", "the custom-invoice change does not touch Stripe metadata or the amount",
    (s) => {
      const c = codeOnly(s.cpr);
      const i = c.indexOf("const stripeMeta");
      const seg = c.slice(i, c.indexOf("try {", i));
      return i > 0 && !/authorizes/.test(seg);
    }],
  ["K6", "each pet row is rebuilt from the canonical keys only",
    (s) => {
      const b = sqlCode(fnBody(s.mig, "normalize_order_pet_row"));
      return /jsonb_build_object\('name', v_name, 'type', v_type,\s*'breed', v_breed, 'age', v_age, 'weight', v_wt\)/
          .test(b.replace(/\s+/g, " ").replace(/jsonb_build_object\('name', v_name, 'type', v_type, 'breed', v_breed, 'age', v_age, 'weight', v_wt\)/,
            "jsonb_build_object('name', v_name, 'type', v_type,\n 'breed', v_breed, 'age', v_age, 'weight', v_wt)"))
        || /jsonb_build_object\('name', v_name, 'type', v_type, 'breed', v_breed, 'age', v_age, 'weight', v_wt\)/
          .test(b.replace(/\s+/g, " "));
    }],
  // LIVE requirement: an admin correction must never be the thing that deletes
  // a pet field this editor does not understand.
  ["K7", "unknown pet keys are PRESERVED from the stored and submitted rows",
    (s) => {
      const b = sqlCode(fnBody(s.live, "normalize_order_pet_row"));
      return /v_extra := v_extra \|\| \(p_prior - v_canonical\);/.test(b)
          && /v_extra := v_extra \|\| \(p_pet - v_canonical\);/.test(b)
          && /v := v_extra;/.test(b);
    }],
  ["K7b", "the validated canonical fields are applied AFTER the extras, so they win",
    (s) => {
      const b = sqlCode(fnBody(s.live, "normalize_order_pet_row"));
      return b.indexOf("v := v_extra;") < b.indexOf("jsonb_build_object('name', v_name");
    }],
  ["K7c", "the mutation hands the STORED row to the normaliser",
    (s) => {
      const c = sqlCode(s.live);
      return /v_pets_before -> v_pet_idx/.test(c)
          && /with ordinality/.test(c);
    }],
  ["K7d", "the ambiguous 1-arg normaliser overload is dropped, not left as a trap",
    (s) => /drop function if exists public\.normalize_order_pet_row\(jsonb\);/.test(sqlCode(s.live))],
  ["K7e", "the UI round-trips the whole stored pet object",
    (s) => {
      const c = codeOnly(s.ui);
      return /\.\.\.p\.raw,/.test(c) && /raw: raw \?\? \{\}/.test(c);
    }],

  // ── L · the frozen file gets a mount and nothing else ─────────────────────
  ["L1", "OrderDetailModal imports and mounts the isolated component",
    (s) => {
      const c = codeOnly(s.modal);
      return /import OrderCustomerPetsMenuAction from "\.\/OrderCustomerPetsMenuAction";/.test(c)
          && /<OrderCustomerPetsMenuAction/.test(c);
    }],
  ["L2", "the frozen file contains no correction logic of its own",
    (s) => {
      const c = codeOnly(s.modal);
      return !/admin_update_order_customer_and_pets/.test(c)
          && !/admin_order_customer_pet_edit_state/.test(c)
          && !/available_additional_pet_authorizations/.test(c);
    }],
  ["L3", "the committed snapshot — not the form — is pushed back into the modal",
    (s) => {
      const c = codeOnly(s.ui);
      return /if \(!committed\?\.ok\) throw new Error/.test(c)
          && c.indexOf("if (!committed?.ok) throw new Error") < c.indexOf("onSaved?.(")
          && /setSuccess\(/.test(c) && c.indexOf("onSaved?.(") < c.indexOf("setSuccess(bits.join");
    }],
  ["L4", "double submission is blocked synchronously, not by React state alone",
    (s) => {
      const c = codeOnly(s.ui);
      return /const busyRef = useRef\(false\);/.test(c)
          && /if \(busyRef\.current\) return;/.test(c)
          && /const idemRef = useRef<string>\(""\);/.test(c);
    }],
  ["L5", "Save stays disabled while a confirmation or the payment gate is unmet",
    (s) => {
      const c = codeOnly(s.ui);
      return /&& !paymentBlocked && confirmationsSatisfied/.test(c)
          && /disabled=\{!canSave\}/.test(c);
    }],
];

// ── Planted negative controls ────────────────────────────────────────────────
// Each deliberately weakens ONE rule and must trip its guard.
const CONTROLS = [
  ["N01", "A1", "mig", (t) => t.replace(
    "  if not public.is_admin_staff() then\n    raise exception 'admin_update_order_customer_and_pets: not authorised'\n      using errcode = 'insufficient_privilege';\n  end if;",
    "  -- authorisation removed")],
  ["N02", "A4", "mig", (t) => t.replace(
    "grant execute on function public.admin_update_order_customer_and_pets(uuid, text, text, text, jsonb, text, text, text, jsonb) to authenticated;",
    "grant execute on function public.admin_update_order_customer_and_pets(uuid, text, text, text, jsonb, text, text, text, jsonb) to anon;")],
  ["N03", "B1", "mig", (t) => t.replace(
    "  select * into v_order from public.orders where id = p_order_id for update;\n  if not found then\n    raise exception 'admin_update_order_customer_and_pets: order % not found', p_order_id;",
    "  select * into v_order from public.orders where id = p_order_id;\n  if not found then\n    raise exception 'admin_update_order_customer_and_pets: order % not found', p_order_id;")],
  ["N04", "B3", "mig", (t) => t.replace(
    "  get diagnostics v_rows = row_count;\n  if v_rows <> 1 or v_order.id is null then",
    "  get diagnostics v_rows = row_count;\n  if false then")],
  ["N05", "B7", "mig", (t) => t.replace(
    "     and btrim(p_expected_fingerprint) <> v_fp_before then",
    "     and false then")],
  ["N05b", "B7b", "mig", (t) => t.replace(
    "    raise exception 'This order changed since you opened the editor. Reload the order and reapply your correction.'\n      using errcode = 'check_violation';",
    "    raise exception 'This order changed since you opened the editor. Reload the order and reapply your correction.'\n      using errcode = 'serialization_failure';")],
  ["N06", "C3", "mig", (t) => t.replace(
    "  if v_count_after + v_added > v_max then",
    "  if v_count_after > v_max then")],
  ["N07", "C1", "mig", (t) => t.replace(
    "  if v_count_after < 1 then\n    raise exception 'An order must keep at least one pet.' using errcode = 'check_violation';\n  end if;",
    "  -- minimum removed")],
  ["N08", "D1", "mig", (t) => t.replace(
    "  v_limit   := v_snap.purchased_pet_limit;",
    "  v_limit   := 3;")],
  ["N09", "D3", "mig", (t) => t.replace(
    "  v_covered := greatest(coalesce(v_limit, 0), v_count_before);",
    "  v_covered := coalesce(v_limit, 3);")],
  ["N10", "E1", "mig", (t) => t.replace(
    "     and r.status  = 'paid'\n     and r.paid_at is not null",
    "     and r.status <> 'draft'")],
  ["N11", "E5", "mig", (t) => t.replace(
    "     and r.metadata ->> 'authorizes' = 'additional_pet'\n", "")],
  ["N12", "E6", "mig", (t) => t.replace(
    "    if coalesce(array_length(v_auth_ids, 1), 0) < v_growth then\n      raise exception 'Additional payment required. Send a custom Additional Pet invoice and wait for payment before adding this pet.'\n        using errcode = 'check_violation';\n    end if;",
    "    if false then\n      raise exception 'unused' using errcode = 'check_violation';\n    end if;")],
  ["N13", "F1", "mig", (t) => t.replace(
    "  constraint uq_pet_correction_auth_request unique (custom_payment_request_id)\n", "  consumed_note text\n")],
  ["N14", "F2", "mig", (t) => t.replace(
    "     and not exists (\n       select 1 from public.order_pet_correction_authorizations a\n        where a.custom_payment_request_id = r.id\n     )\n", "")],
  ["N15", "G1", "mig", (t) => t.replace(
    "         state              = v_state,", "         state              = p_state,")],
  ["N16", "G2", "mig", (t) => t.replace(
    "    if v_state is null then\n      raise exception 'Enter a valid US state.' using errcode = 'check_violation';\n    end if;",
    "    v_state := coalesce(v_state, upper(btrim(p_state)));")],
  ["N17", "H3", "mig", (t) => t.replace(
    "         doctor_status      = case when v_unassign then 'unassigned' else doctor_status end",
    "         doctor_status      = doctor_status")],
  ["N18", "H5", "mig", (t) => t.replace(
    "  if v_reissue then",
    "  update public.doctor_profiles set licensed_states = licensed_states || array[v_state] where user_id = v_prior.doctor_user_id;\n  if v_reissue then")],
  ["N19", "I1", "mig", (t) => t.replace(
    "  if v_reissue then",
    "  update public.order_documents set superseded_at = now() where order_id = p_order_id;\n  if v_reissue then")],
  ["N20", "I3", "mig", (t) => t.replace(
    "    v_reopen := public.reopen_order_under_review(",
    "    v_reopen := to_jsonb('skipped'::text); perform public.noop_reopen(")],
  ["N21", "I4", "mig", (t) => t.replace(
    "    if coalesce((v_confirm ->> 'document_reissue')::boolean, false) is not true then\n      v_needed := array_append(v_needed, 'document_reissue');\n    end if;",
    "    null;")],
  ["N22", "J1", "mig", (t) => t.replace(
    "  v_reason := public.validate_reopen_reason(p_reason);",
    "  v_reason := coalesce(p_reason, '');")],
  ["N23", "J3", "mig", (t) => t.replace(
    "      'state', v_prior.state, 'pets', v_pets_before, 'pet_count', v_count_before,",
    "      'state', v_prior.state, 'pet_count', v_count_before,")],
  ["N23b", "J4b", "mig", (t) => t.replace(
    "    v_needed := array_append(v_needed, 'state');",
    "    v_needed := v_needed || 'state';")],
  ["N24", "K1", "mig", (t) => t.replace(
    "         state              = v_state,",
    "         state              = v_state,\n         gclid              = null,")],
  ["N25", "K2", "mig", (t) => t.replace(
    "         state              = v_state,",
    "         state              = v_state,\n         price              = 0,")],
  ["N26", "K3", "mig", (t) => t.replace(
    "         assessment_answers = jsonb_set(\n                                coalesce(assessment_answers, '{}'::jsonb),\n                                '{pets}', v_pets_after, true),",
    "         assessment_answers = jsonb_build_object('pets', v_pets_after),")],
  ["N27", "K7", "live", (t) => t.replace(
    "  v_extra := v_extra || (p_prior - v_canonical);\n", "")],
  ["N27b", "K7c", "live", (t) => t.replace(
    "        case when jsonb_typeof(v_pets_before -> v_pet_idx) = ''object''\n             then v_pets_before -> v_pet_idx else ''{}''::jsonb end));",
    "        ''{}''::jsonb));")],
  ["N27c", "K7d", "live", (t) => t.replace(
    "drop function if exists public.normalize_order_pet_row(jsonb);", "-- overload left in place")],
  ["N27d", "K7e", "ui", (t) => t.replace("          ...p.raw,\n", "")],
  ["N28", "E8", "cpr", (t) => t.replace(
    "  if (authorizes && !VALID_AUTHORIZES.includes(authorizes as typeof VALID_AUTHORIZES[number])) {\n    return json(400, { ok: false, error: `Unsupported authorizes: ${authorizes}` });\n  }",
    "")],
  // The exact defect found during deploy: finalising the invoice replaced the
  // whole metadata column and erased the authorises label.
  ["N28b", "E8b", "cpr", (t) => t.replace(
    "      metadata: { ...(authorizes ? { authorizes } : {}), stripe_invoice_number: finalized.number ?? null },",
    "      metadata: { stripe_invoice_number: finalized.number ?? null },")],
  ["N29", "K5", "cpr", (t) => t.replace(
    "    purpose,\n  };", "    purpose,\n    authorizes,\n  };")],
  ["N30", "L2", "modal", (t) => t.replace(
    "import OrderCustomerPetsMenuAction from \"./OrderCustomerPetsMenuAction\";",
    "import OrderCustomerPetsMenuAction from \"./OrderCustomerPetsMenuAction\";\nconst PET_RPC = supabase.rpc(\"admin_update_order_customer_and_pets\");")],
  ["N31", "L4", "ui", (t) => t.replace(
    "    if (busyRef.current) return;\n    busyRef.current = true;\n    setBusy(true); setError(\"\"); setSuccess(\"\");",
    "    setBusy(true); setError(\"\"); setSuccess(\"\");")],
  ["N32", "L5", "ui", (t) => t.replace(
    "    && !ceilingExceeded && !paymentBlocked && confirmationsSatisfied",
    "    && !ceilingExceeded")],
  ["N33", "E9", "ui", (t) => t.replace(
    "          amountCents: Math.round(dollars * 100),", "          amountCents: 3000,")],
  ["N34", "L3", "ui", (t) => t.replace(
    "      if (!committed?.ok) throw new Error(\"The correction did not commit. Nothing was changed.\");\n\n      onSaved?.({",
    "      onSaved?.({")],
  ["N35", "C4", "ui", (t) => t.replace(
    'import { PET_TYPES } from "../../assessment/components/Step2PersonalInfo";',
    'import { PET_TYPE_OPTIONS } from "../../assessment/components/step1/PetSection";')],
  ["N35b", "C4b", "ui", (t) => t.replace(
    "  const maxPets = state?.max_total_pets ?? MIN_PETS_PER_ORDER;",
    "  const maxPets = 3;")],
  ["N35c", "C4c", "step2", (t) => t.replace(
    'export const PET_TYPES = ["Dog", "Cat", "Bird", "Rabbit", "Hamster", "Guinea Pig", "Other"];',
    'const PET_TYPES = ["Dog", "Cat", "Bird", "Rabbit", "Hamster", "Guinea Pig", "Other"];')],
  ["N36", "J8", "ui", (t) => t.replace(
    "  const canSave = !!state && !busy && somethingChanged && petsValid && reasonValid",
    "  const canSave = !!state && !busy && somethingChanged && petsValid")],
  ["N37", "A6", "mig", (t) => t.replace(
    "revoke all on public.order_pet_correction_authorizations from public, anon, authenticated;",
    "grant select on public.order_pet_correction_authorizations to authenticated;")],
  ["N38", "B2", "mig", (t) => t.replace(
    "  if v_reissue then",
    "  update public.orders set last_contacted_at = now() where id = p_order_id;\n  if v_reissue then")],
  // Genuinely RELOCATES the row-count verification to after the audit insert,
  // so a zero-row update would already have written a success audit event.
  ["N39", "J6", "mig", (t) => {
    const block = "  get diagnostics v_rows = row_count;\n"
      + "  if v_rows <> 1 or v_order.id is null then\n"
      + "    raise exception 'admin_update_order_customer_and_pets: expected exactly 1 updated row, got %', v_rows\n"
      + "      using errcode = 'internal_error';\n"
      + "  end if;\n";
    if (!t.includes(block)) return t;
    const without = t.replace(block, "");
    const anchor = "  returning id into v_audit_id;\n";
    const at = without.indexOf(anchor);
    if (at < 0) return t;
    return without.slice(0, at + anchor.length) + block + without.slice(at + anchor.length);
  }],
  ["N40", "I6", "mig", (t) => t.replace(
    "               and d.doc_type in ('esa_letter', 'psd_letter')",
    "               and d.doc_type in ('esa_letter', 'psd_letter', 'customer_upload')")],
];

function loadAll(override) {
  const s = {};
  for (const k of Object.keys(F)) s[k] = read(k, override);
  return s;
}

function run(src) {
  const results = [];
  for (const [id, desc, fn] of CHECKS) {
    let ok = false;
    try { ok = !!fn(src); } catch { ok = false; }
    results.push([id, desc, ok]);
  }
  return results;
}

if (SELF) {
  console.log("ADMIN-ORDER-CUSTOMER-PET-EDITING-001 — negative controls\n");
  const base = loadAll();
  let bad = 0;
  for (const [label, target, fileKey, mutate] of CONTROLS) {
    const mutated = { ...base, [fileKey]: mutate(base[fileKey]) };
    if (mutated[fileKey] === base[fileKey]) {
      console.log(`  ?? ${label}: mutation was a no-op (guard text drifted) — target ${target}`);
      bad++; continue;
    }
    const res = run(mutated).find((r) => r[0] === target);
    const tripped = res && res[2] === false;
    console.log(`  ${tripped ? "OK" : "XX"} ${label}: ${target} ${tripped ? "trips" : "DID NOT TRIP"}`);
    if (!tripped) bad++;
  }
  console.log(`\n${CONTROLS.length - bad}/${CONTROLS.length} controls trip correctly.`);
  // process.exitCode, never process.exit(), so nothing is torn down mid-restore.
  process.exitCode = bad === 0 ? 0 : 1;
} else {
  const src = loadAll();
  const results = run(src);
  const failed = results.filter((r) => !r[2]);

  console.log("ADMIN-ORDER-CUSTOMER-PET-EDITING-001 — guard\n");
  for (const [id, desc, ok] of results) {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${desc}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

  if (failed.length) {
    console.log(WARN ? "\n(--warn-only: not failing the build)" : "\nGUARD FAILED");
    process.exitCode = WARN ? 0 : 1;
  }
}
