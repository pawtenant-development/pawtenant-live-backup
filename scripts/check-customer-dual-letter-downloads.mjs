// scripts/check-customer-dual-letter-downloads.mjs
//
// CUSTOMER-DUAL-LETTER-DOWNLOADS-001 — customer dual letter download guard.
//
// WHAT THIS PINS. The provider's ORIGINAL letter and the VERIFICATION-ID copy
// have always been two separate storage objects:
//
//     order_documents.file_url            → provider-letters/<cid>/provider/<file>
//     order_documents.processed_file_url  → letters/<cid>-<docid>-verified.pdf
//
// Nothing in the pipeline has ever rewritten `file_url` — injectPdfVerification()
// uploads to a different bucket under a different name. The defect was purely
// that the customer portal exposed ONE ambiguous "Download", so the second file
// was unreachable. This guard keeps both reachable, keeps them distinct, and
// keeps the owner-mandated order.
//
//   D1  the resolver models BOTH artifacts (original + verification).
//   D2  the resolver only offers a variant whose file genuinely exists.
//   D3  the resolver refuses to offer two buttons for ONE storage object.
//   D4  the card renders "Download Original" BEFORE "Download Verification ID PDF".
//   D5  the card no longer renders the ambiguous generic Open/Download for a
//       letter that has the two labelled actions.
//   D6  each button sends its own strict `variant`.
//   D7  the edge function honours `variant` strictly — a named artifact is
//       never substituted by the other one.
//   D8  a missing artifact is a 404 with a code, not a silent fallback.
//   D9  the edge function still enforces owning-customer / assigned-provider
//       authorization before signing anything.
//   D10 a caller-supplied download filename is sanitized before it reaches
//       Content-Disposition.
//   D11 injection still writes to a NEW object and never back over file_url.
//   D12 buttons wrap rather than clip on narrow screens.
//
// Static assertions only — no runtime, no network, no DB.
//
// Usage:
//   node scripts/check-customer-dual-letter-downloads.mjs             → guard (exit 1 on fail)
//   node scripts/check-customer-dual-letter-downloads.mjs --warn-only → audit (exit 0)
//   node scripts/check-customer-dual-letter-downloads.mjs --self-test → prove controls trip

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const NAME = "check-customer-dual-letter-downloads";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WARN = process.argv.includes("--warn-only");
const SELF = process.argv.includes("--self-test");

const F = {
  resolver: "src/lib/customerDocuments.ts",
  card: "src/pages/my-orders/components/MyDocumentsCard.tsx",
  opener: "src/lib/openSecureDocument.ts",
  signer: "supabase/functions/get-document-signed-url/index.ts",
  submit: "supabase/functions/provider-submit-letter/index.ts",
};

function read(key, override) {
  if (override && override[key] !== undefined) return override[key];
  const abs = resolve(ROOT, F[key]);
  if (!existsSync(abs)) throw new Error(`missing file: ${F[key]}`);
  return readFileSync(abs, "utf8");
}

/**
 * Strip comments AND string/template literals.
 *
 * Every "must NOT contain" assertion below runs on this projection. A guard that
 * scans raw source proves only that a phrase is absent from the TEXT — the very
 * comments explaining the rule would trip it, and a forbidden call hidden in a
 * template literal would slip past. CRLF is normalised first so a checkout with
 * Windows line endings cannot turn a control into a silent no-op.
 */
function codeOnly(src) {
  return src
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

/** Comments stripped but literals KEPT — for asserting user-visible copy. */
function withLiterals(src) {
  return src
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/** The body of the `variant === "verification"` branch in the signer. */
function verificationBranch(signerCode) {
  const start = signerCode.indexOf('variant === ""');
  if (start === -1) return null;
  // second occurrence is the verification arm (original comes first)
  const second = signerCode.indexOf('variant === ""', start + 1);
  if (second === -1) return null;
  const open = signerCode.indexOf("{", second);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < signerCode.length; i++) {
    if (signerCode[i] === "{") depth++;
    else if (signerCode[i] === "}") {
      depth--;
      if (depth === 0) return signerCode.slice(open, i + 1);
    }
  }
  return null;
}

function runChecks(o) {
  const resolverRaw = read("resolver", o);
  const cardRaw = read("card", o);
  const openerRaw = read("opener", o);
  const signerRaw = read("signer", o);
  const submitRaw = read("submit", o);

  const resolver = codeOnly(resolverRaw);
  const card = codeOnly(cardRaw);
  const cardCopy = withLiterals(cardRaw);
  const opener = codeOnly(openerRaw);
  const signer = codeOnly(signerRaw);
  const signerCopy = withLiterals(signerRaw);
  const submit = codeOnly(submitRaw);

  const r = [];
  const add = (id, desc, ok) => r.push({ id, desc, ok: !!ok });

  // ── D1 ── both artifacts modelled
  add("D1", "resolver exposes originalDownload AND verificationDownload",
    /originalDownload\s*[?:]/.test(resolver) && /verificationDownload\s*[?:]/.test(resolver));

  // ── D2 ── existence-gated
  add("D2", "resolver gates each variant on its own stored file",
    /hasOriginal\s*=/.test(resolver) &&
    /hasVerification\s*=/.test(resolver) &&
    /footer_injected/.test(resolver) &&
    /processed_file_url/.test(resolver) &&
    /missingArtifacts/.test(resolver));

  // ── D3 ── never two buttons for one object
  add("D3", "resolver suppresses a variant when both pointers name one object",
    /storageObjectKey/.test(resolver) &&
    /collides/.test(resolver) &&
    /originalKey\s*===\s*verificationKey/.test(resolver));

  // ── D4 ── DOM order (user-visible copy, literals kept)
  const iOrig = cardCopy.indexOf("Download Original");
  const iVer = cardCopy.indexOf("Download Verification ID PDF");
  add("D4", "card renders Download Original BEFORE Download Verification ID PDF",
    iOrig !== -1 && iVer !== -1 && iOrig < iVer);

  // ── D5 ── generic actions removed from the dual-download branch
  add("D5", "letter card branches away from the generic Open/Download pair",
    /dualDownloads/.test(card) && /dualDownloads\s*\?/.test(card));

  // ── D6 ── each button sends its strict variant
  add("D6", "downloads pass a strict variant through the opener",
    /variant:\s*target\.variant/.test(card) && /opts\.variant/.test(opener));

  // ── D7 ── strict, no cross-substitution
  //
  // `processed_file_url` CONTAINS the substring `file_url`, so a naive
  // /file_url/ scan matches the very column this branch is supposed to read and
  // the check can never pass. The negative lookbehind is what makes the
  // assertion mean "the ORIGINAL column is not referenced here".
  const vBranch = verificationBranch(signer);
  add("D7", "signer's verification branch never falls back to file_url",
    !!vBranch && !/(?<!processed_)\bfile_url\b/.test(vBranch) && /processed_file_url/.test(vBranch));

  // ── D8 ── missing artifact = coded 404
  add("D8", "signer 404s with a code instead of substituting",
    /verification_unavailable/.test(signerCopy) &&
    /original_unavailable/.test(signerCopy) &&
    /404/.test(signer));

  // ── D9 ── authorization intact
  add("D9", "signer still enforces owning-customer / assigned-provider authz",
    /isOwningCustomer/.test(signer) &&
    /isAssignedProvider/.test(signer) &&
    /customer_visible/.test(signer) &&
    /Not authorized for this document/.test(signerCopy));

  // ── D10 ── filename sanitized before Content-Disposition
  add("D10", "caller-supplied download filename is sanitized",
    /safeDownloadFilename/.test(signer) &&
    /\[\^A-Za-z0-9\._-\]/.test(signerRaw.replace(/\r\n/g, "\n")) &&
    /download:\s*filename/.test(signer));

  // ── D11 ── injection never overwrites the provider original
  const injects = submit.includes("injectPdfVerification");
  const writesBackToFileUrl =
    /order_documents[\s\S]{0,400}?update\(\{[^}]*\bfile_url\s*:/.test(submit) ||
    /update\(\{[^}]*\bfile_url\s*:[^}]*\}\)[\s\S]{0,200}?eq\(""\s*,\s*documentId/.test(submit);
  add("D11", "provider-submit-letter never writes back over file_url",
    injects && !writesBackToFileUrl && /processed_file_url:\s*processedUrl/.test(submit));

  // ── D12 ── responsive, non-clipping buttons
  //
  // Tailwind classes live INSIDE string literals, so this must read the
  // literals-kept projection. Scanning `card` (literals stripped) made every
  // class name invisible and the check unsatisfiable — and, worse, made its own
  // negative control report a false CAUGHT because base and patched both failed.
  add("D12", "letter buttons wrap instead of clipping",
    /flex-wrap/.test(cardCopy) &&
    /whitespace-nowrap/.test(cardCopy) &&
    !/\btruncate\b/.test(cardCopy) &&
    !/\bflex-nowrap\b/.test(cardCopy));

  return r;
}

// ── Negative controls ────────────────────────────────────────────────────────
// Each patch reproduces a specific pre-fix or regressed shape. A control that
// does not actually change the source is reported NO-OP and fails the run.
const CONTROLS = [
  ["D1", "resolver drops verificationDownload (pre-fix single-artifact model)",
    (b) => ({ resolver: b.resolver.replace(/verificationDownload/g, "xxDropped") })],
  ["D2", "resolver stops tracking missing artifacts",
    (b) => ({ resolver: b.resolver.replace(/missingArtifacts/g, "xxGone") })],
  ["D3", "resolver drops the same-object collision guard",
    (b) => ({ resolver: b.resolver.replace(/originalKey\s*===\s*verificationKey/g, "false") })],
  ["D4", "card renders the two buttons in the WRONG order",
    (b) => ({
      card: b.card
        .replace(/Download Original/g, "__A__")
        .replace(/Download Verification ID PDF/g, "Download Original")
        .replace(/__A__/g, "Download Verification ID PDF"),
    })],
  ["D5", "card falls back to the ambiguous generic pair for letters",
    (b) => ({ card: b.card.replace(/dualDownloads/g, "xxFlat") })],
  ["D6", "buttons stop sending a strict variant",
    (b) => ({
      card: b.card.replace(/variant:\s*target\.variant/g, "variant: undefined"),
      opener: b.opener.replace(/opts\.variant/g, "undefined"),
    })],
  ["D7", "signer's verification branch falls back to the original",
    (b) => ({
      signer: b.signer.replace(
        /candidateUrl = row\.processed_file_url;/,
        "candidateUrl = row.processed_file_url ?? row.file_url;",
      ),
    })],
  ["D8", "signer drops the coded 404 for a missing artifact",
    (b) => ({ signer: b.signer.replace(/verification_unavailable/g, "") })],
  ["D9", "signer drops the owning-customer authz check",
    (b) => ({ signer: b.signer.replace(/isOwningCustomer/g, "true /*x*/") })],
  ["D10", "signer passes the raw caller filename straight through",
    (b) => ({ signer: b.signer.replace(/safeDownloadFilename/g, "String") })],
  ["D11", "injection writes back over the provider original",
    (b) => ({
      submit: b.submit.replace(
        /processed_file_url: processedUrl,/,
        "processed_file_url: processedUrl,\n      file_url: processedUrl,",
      ),
    })],
  ["D12", "letter buttons stop wrapping on narrow screens",
    (b) => ({ card: b.card.replace(/flex-wrap/g, "flex-nowrap") })],
];

try {
  const base = Object.fromEntries(Object.keys(F).map((k) => [k, read(k)]));

  if (SELF) {
    console.log(`[${NAME}] self-test — each control must TRIP its check\n`);
    let bad = 0;
    for (const [target, label, patchFn] of CONTROLS) {
      const patch = patchFn(base);
      const changed = Object.keys(patch).some((k) => patch[k] !== base[k]);
      const results = runChecks({ ...base, ...patch });
      const hit = results.find((x) => x.id === target);
      const tripped = changed && hit && !hit.ok;
      if (!tripped) bad++;
      console.log(
        `  ${tripped ? "CAUGHT " : changed ? "MISSED " : "NO-OP  "} ${target.padEnd(4)} ${label}`,
      );
    }
    console.log(`\n${CONTROLS.length - bad}/${CONTROLS.length} negative controls caught.`);
    process.exit(bad === 0 ? 0 : 1);
  }

  const results = runChecks(base);
  const failed = results.filter((x) => !x.ok);
  for (const x of results) console.log(`  ${x.ok ? "PASS" : "FAIL"}  ${x.id.padEnd(4)} ${x.desc}`);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

  if (failed.length && !WARN) process.exit(1);
  process.exit(0);
} catch (e) {
  console.error(`[${NAME}] ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(WARN ? 0 : 1);
}
