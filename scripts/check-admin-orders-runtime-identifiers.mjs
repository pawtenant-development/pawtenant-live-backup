#!/usr/bin/env node
// ADMIN-ORDERS-RUNTIME-IDENTIFIER-CLOSURE-001 — build guard + negative controls.
//
// WHY THIS EXISTS
// The Command Center / Admin Orders promotion was deployed to production and
// crashed the admin portal twice with `ReferenceError: refreshNonce is not
// defined` and a call to `handleDirectLookup`, which was never declared on this
// side. A third one, `notifyOrderPaid`, was found by type-check before it could
// ship. All three are the SAME defect: a cross-repo port brought a CALL SITE
// across without the DECLARATION it depends on.
//
// Nothing in the existing chain could catch that:
//   * `vite build` compiles with SWC, which STRIPS types and never checks them,
//     so an undeclared identifier is simply emitted as a free variable.
//   * the bundler treats a free variable as a global and stays silent.
//   * `tsc` does catch it (TS2304), but it is NOT part of `npm run build` and
//     this repo carries pre-existing errors in unrelated files, so its exit code
//     alone cannot gate the build.
//
// So this guard closes the loop cheaply: every identifier the admin-orders page
// USES must be DECLARED in that file, imported into it, or a real global.
//
// It asserts USE, not mention — comments and string literals are removed before
// any scan, so prose that merely names `refreshNonce` cannot satisfy or trip a
// rule. Template-literal `${...}` expressions are KEPT, because they contain
// real code.
//
//   node scripts/check-admin-orders-runtime-identifiers.mjs             → static
//   node scripts/check-admin-orders-runtime-identifiers.mjs --self-test → + negative controls

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const RED = "\x1b[31m", GREEN = "\x1b[32m", DIM = "\x1b[2m", RESET = "\x1b[0m";

const PAGE = resolve(ROOT, "src/pages/admin-orders/page.tsx");
const read = (p) => readFileSync(p, "utf8");

// ── Strip comments and string literals, KEEP ${...} interpolations ───────────
//
// Hand-rolled scanner rather than a regex: a regex cannot tell `//` inside a
// URL string from a real line comment, and getting that wrong is exactly how a
// guard starts asserting the mention instead of the use.
export function stripCommentsAndStrings(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  // Depth of template-literal nesting we are currently inside.
  const tmplStack = [];

  while (i < n) {
    const c = src[i], c2 = src[i + 1];

    // Inside a template literal: copy ${...} through, drop the literal text.
    if (tmplStack.length > 0 && tmplStack[tmplStack.length - 1] === "tmpl") {
      if (c === "\\") { i += 2; continue; }
      if (c === "`") { tmplStack.pop(); i++; continue; }
      if (c === "$" && c2 === "{") { tmplStack.push("expr"); out += "  "; i += 2; continue; }
      out += c === "\n" ? "\n" : " ";
      i++;
      continue;
    }

    if (c === "/" && c2 === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && c2 === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") out += "\n"; i++; }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      i++;
      while (i < n && src[i] !== quote) { if (src[i] === "\\") i++; i++; }
      i++;
      out += '""';
      continue;
    }
    if (c === "`") { tmplStack.push("tmpl"); i++; continue; }
    if (c === "}" && tmplStack.length > 0 && tmplStack[tmplStack.length - 1] === "expr") {
      tmplStack.pop(); out += " "; i++; continue;
    }
    out += c;
    i++;
  }
  return out;
}

// Tokens that may legally precede a call expression as a bare word.
// Anything ELSE preceding one means we are looking at prose, not code:
// `…cannot be assigned (unpaid, refunded, or completed).` is JSX text, and
// `be assigned(` is not a call — JavaScript never puts two bare identifiers
// side by side. Blanking `>`…`<` runs was tried first and is WRONG here,
// because TSX is full of `=>` and `useState<Order[]>`.
const CALLABLE_AFTER = new Set([
  "return", "await", "new", "typeof", "void", "case", "in", "of", "else", "do",
  "yield", "delete", "throw", "default", "export", "instanceof",
]);

// ── Declarations visible anywhere in the module ──────────────────────────────
// Deliberately over-collects (any binding form, any scope). A guard that
// over-collects declarations can only ever MISS a defect, never invent one —
// and this guard's job is to be trusted enough to gate a production build.
export function collectDeclared(code) {
  const declared = new Set();
  const add = (raw) => {
    if (!raw) return;
    for (const part of raw.split(/[,\s]+/)) {
      const m = part.match(/^[A-Za-z_$][\w$]*/);
      if (m) declared.add(m[0]);
    }
  };

  // import defaults / namespaces / named bindings (incl. `as` renames)
  for (const m of code.matchAll(/import\s+([\s\S]*?)\s+from\s/g)) {
    const clause = m[1];
    for (const part of clause.split(/[{},]/)) {
      const t = part.trim();
      if (!t) continue;
      const asRename = t.match(/\bas\s+([A-Za-z_$][\w$]*)/);
      if (asRename) { declared.add(asRename[1]); continue; }
      add(t.replace(/^\*\s*/, "").replace(/^type\s+/, ""));
    }
  }
  // const/let/var, including array + object destructuring
  for (const m of code.matchAll(/\b(?:const|let|var)\s+(\[[^\]]*\]|\{[^}]*\}|[A-Za-z_$][\w$]*)/g)) {
    const t = m[1];
    if (t.startsWith("[") || t.startsWith("{")) {
      add(t.slice(1, -1).replace(/:\s*[A-Za-z_$][\w$]*/g, (s) => s.replace(/^:\s*/, " ")).replace(/=[^,]*/g, ""));
    } else add(t);
  }
  // function / class declarations
  for (const m of code.matchAll(/\b(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  // type / interface / enum names
  for (const m of code.matchAll(/\b(?:type|interface|enum)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  // parameters of every arrow / function head, and catch bindings
  for (const m of code.matchAll(/\(([^()]*)\)\s*(?::[^=;{]*)?=>/g)) add(m[1].replace(/:[^,]*/g, ""));
  for (const m of code.matchAll(/\bfunction\s*[A-Za-z_$\w]*\s*\(([^()]*)\)/g)) add(m[1].replace(/:[^,]*/g, ""));
  for (const m of code.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  // single-parameter arrows without parentheses: `x => ...`
  for (const m of code.matchAll(/(?:^|[(,[{=>;\s])([A-Za-z_$][\w$]*)\s*=>/g)) declared.add(m[1]);
  // for (const x of ...) / labelled loop vars are covered by const|let|var above
  return declared;
}

// Real globals and platform APIs. Anything NOT here and NOT declared is a defect.
const GLOBALS = new Set([
  // language
  "Object", "Array", "String", "Number", "Boolean", "Symbol", "BigInt", "Math", "JSON",
  "Date", "RegExp", "Error", "TypeError", "RangeError", "Promise", "Map", "Set",
  "WeakMap", "WeakSet", "Proxy", "Reflect", "Intl", "globalThis", "NaN", "Infinity",
  "undefined", "null", "true", "false", "this", "super", "arguments", "console",
  "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURIComponent", "decodeURIComponent",
  "encodeURI", "decodeURI", "structuredClone", "queueMicrotask",
  // browser / DOM
  "window", "document", "navigator", "location", "history", "localStorage", "sessionStorage",
  "fetch", "URL", "URLSearchParams", "Blob", "File", "FileReader", "FormData", "Headers",
  "Request", "Response", "AbortController", "Image", "Audio", "Notification", "alert",
  "confirm", "prompt", "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "requestAnimationFrame", "cancelAnimationFrame", "IntersectionObserver", "ResizeObserver",
  "MutationObserver", "PerformanceObserver", "performance", "CustomEvent", "Event", "atob", "btoa",
  "TextEncoder", "TextDecoder", "crypto", "matchMedia", "getComputedStyle", "scrollTo",
  // React hook / API surface is imported, so it is picked up by collectDeclared.
  // TS-only keywords that can appear in call position after stripping.
  "import", "require", "typeof", "keyof", "as", "satisfies", "await", "return", "if",
  "for", "while", "switch", "catch", "function", "new", "delete", "void", "in", "of",
  "do", "else", "try", "finally", "throw", "yield", "case", "default", "class", "extends",
  "async", "get", "set", "static", "let", "const", "var", "instanceof",
]);

// ── Rules ────────────────────────────────────────────────────────────────────

/** Root identifiers listed in a hook dependency array. */
export function depArrayIdentifiers(code) {
  const found = [];
  // `}, [a, b.c, d]);`  — the closing shape of every useEffect/useCallback/useMemo.
  for (const m of code.matchAll(/\}\s*,\s*\[([^\]]*)\]\s*\)/g)) {
    const inner = m[1];
    for (const t of inner.split(",")) {
      const root = t.trim().match(/^([A-Za-z_$][\w$]*)/);
      if (root) found.push(root[1]);
    }
  }
  return found;
}

/** Identifiers in call position that are not property accesses (`x(` not `.x(`). */
export function calledIdentifiers(code) {
  const found = [];
  const re = /(^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const idStart = m.index + m[1].length;
    const prevWord = code.slice(Math.max(0, idStart - 80), idStart).match(/([A-Za-z_$][\w$]*)\s+$/);
    // Two bare words in a row is prose, not a call.
    if (prevWord && !CALLABLE_AFTER.has(prevWord[1])) continue;
    found.push(m[2]);
  }
  return found;
}

function analyse(src) {
  const code = stripCommentsAndStrings(src);
  const declared = collectDeclared(code);
  const problems = [];

  for (const id of new Set(depArrayIdentifiers(code))) {
    // A dependency array only ever lists local bindings — never a global.
    if (!declared.has(id)) problems.push({ kind: "dep-array", id });
  }
  for (const id of new Set(calledIdentifiers(code))) {
    if (declared.has(id) || GLOBALS.has(id)) continue;
    // JSX component calls and TS generics are not call sites we can resolve
    // here; component names are capitalised, so skip those conservatively.
    if (/^[A-Z]/.test(id)) continue;
    problems.push({ kind: "call", id });
  }
  return { code, declared, problems };
}

// ── Static run ───────────────────────────────────────────────────────────────

/**
 * Every rule this guard enforces, against an arbitrary source string.
 * Shared by the build check and the negative controls, so a control can never
 * pass against a re-implementation of a rule the build does not actually run.
 */
export function policyFails(src) {
  const fails = [];
  const { code, problems } = analyse(src);

  for (const p of problems) {
    fails.push(
      p.kind === "dep-array"
        ? `\`${p.id}\` appears in a hook dependency array but is never declared in this file (this is the refreshNonce crash)`
        : `\`${p.id}()\` is called but never declared or imported in this file (this is the handleDirectLookup crash)`,
    );
  }

  // Named regressions — asserted against the STRIPPED source, so the comments
  // in page.tsx that explain these two adaptations cannot satisfy them.
  if (/\brefreshNonce\b/.test(code)) {
    fails.push("`refreshNonce` is USED in code — LIVE's canonical token is `aggregateReloadToken`");
  }
  if (!/const\s+handleDirectLookup\s*=/.test(code)) {
    fails.push("`handleDirectLookup` has no declaration in this file");
  }
  if (!/setOrderFactsReady\(true\)[\s\S]{0,400}\}\s*,\s*\[\s*aggregateReloadToken\s*\]\s*\)/.test(code)) {
    fails.push("the whole-table facts projection is not keyed on `aggregateReloadToken`");
  }
  // LIVE has exactly two legitimate reload counters. Any THIRD one is the
  // "redundant second refresh counter" this adaptation exists to avoid — the
  // port must reuse aggregateReloadToken, not grow a parallel nonce.
  const ALLOWED_COUNTERS = new Set(["aggregateReloadToken", "monthlyKpiReloadToken"]);
  const counters = [...code.matchAll(/const\s*\[\s*([A-Za-z_$][\w$]*(?:[Nn]once|[Rr]eloadToken|[Rr]efreshToken|[Rr]eloadCounter)[\w$]*)\s*,/g)]
    .map((m) => m[1])
    .filter((name) => !ALLOWED_COUNTERS.has(name));
  if (counters.length) {
    fails.push(`redundant refresh counter(s) introduced: ${counters.join(", ")} — reuse aggregateReloadToken`);
  }
  // ── Polling: the contact badge may poll; the ORDERS LIST may not ───────────
  //
  // Not a blanket ban. One intended 60s poll counts unread contact_submissions
  // and must survive; what must stay gone is the 30-second sweep that re-walked
  // the whole orders table. So each timer is judged by WHAT IT RELOADS.
  const timers = [...code.matchAll(/setInterval\s*\(/g)];
  const ordersReloaders = /loadOrderData|setOrders\b|mutateOrders|ORDER_FACTS_COLUMNS|ORDERS_LIST_COLUMNS|SNAPSHOT_PAGE_SIZE|fetchOrderFacetCounts/;
  for (const t of timers) {
    // The timer callback and its immediate surroundings.
    const window = code.slice(t.index, t.index + 260);
    if (ordersReloaders.test(window)) {
      fails.push("a setInterval reloads the orders list/snapshot — the full-table poll must stay removed");
    }
  }
  if (timers.length !== 1) {
    fails.push(`expected exactly ONE timer (the contact-badge poll), found ${timers.length}`);
  }
  if (!/setInterval\(load,\s*60_?000\)/.test(code)) {
    fails.push("the intended contact-badge poll is missing or changed cadence");
  }

  return fails;
}

function runStatic() {
  const fails = policyFails(read(PAGE));
  if (fails.length) {
    console.error(`${RED}✗ admin-orders runtime identifiers FAILED${RESET}`);
    for (const f of fails) console.error(`  ${RED}•${RESET} ${f}`);
    return 1;
  }
  console.log(`${GREEN}✓ admin-orders runtime identifiers passed${RESET} (every used identifier is declared, imported or a real global)`);
  return 0;
}

// ── NEGATIVE CONTROLS ────────────────────────────────────────────────────────
//
// Each plants a defect into the REAL current source and requires this guard to
// reject it. A control that no longer reproduces its defect is itself a failure,
// so a guard whose anchor has drifted cannot silently become a no-op.

function runSelfTest() {
  const fails = [];
  const src = read(PAGE);
  let n = 0;

  // The unmodified file must PASS, or every control below proves nothing.
  n++;
  if (policyFails(src).length !== 0) {
    fails.push("NC0: the shipped file does not pass, so no control below is meaningful");
  }

  /** Plant a defect into the REAL source and require the SHIPPED rules to reject it. */
  const plant = (label, from, to, expect) => {
    n++;
    const mutated = src.replace(from, to);
    if (mutated === src) {
      fails.push(`${label}: anchor drifted — the defect could not be planted, so this control is a NO-OP`);
      return;
    }
    const got = policyFails(mutated);
    if (!got.some((f) => expect.test(f))) {
      fails.push(`${label}: planted defect was NOT caught (got: ${got.join(" | ") || "no failures"})`);
    }
  };

  // NC1 — the first production crash: the facts effect keyed on a counter that
  // does not exist in this file.
  plant("NC1 refreshNonce in dep array",
    /\}, \[aggregateReloadToken\]\);/, "}, [refreshNonce]);",
    /refreshNonce/);

  // NC2 — the second production crash: call site kept, declaration gone.
  plant("NC2 handleDirectLookup called but undeclared",
    /const handleDirectLookup = useCallback\(/, "const __removed_handleDirectLookup = useCallback(",
    /handleDirectLookup/);

  // NC3 — the one type-check caught before it shipped: a call site dragged in
  // from TEST with no declaration on this side.
  plant("NC3 notifyOrderPaid called but undeclared",
    /const newOrder = payload\.new as Order;/,
    "const newOrder = payload.new as Order;\n          if (newOrder.status === \"paid\") notifyOrderPaid(newOrder);",
    /notifyOrderPaid/);

  // NC4 — the removed 30-second whole-table order poll, reintroduced.
  plant("NC4 orders list back on a timer",
    /const handleRefresh = useCallback\(/,
    "const __poll = setInterval(() => { void loadOrderData(); }, 30000);\n  const handleRefresh = useCallback(",
    /orders list\/snapshot/);

  // NC5 — a redundant second refresh counter.
  plant("NC5 redundant refresh counter",
    /const \[aggregateReloadToken, setAggregateReloadToken\] = useState\(0\);/,
    "const [aggregateReloadToken, setAggregateReloadToken] = useState(0);\n  const [refreshNonceB, setRefreshNonceB] = useState(0);",
    /redundant refresh counter/);

  // NC6 — ASSERTS USE, NOT MENTION. A file where `refreshNonce` appears ONLY in
  // a comment and a string literal must still PASS. Without this control every
  // rule above could be satisfied — or tripped — by prose, and the explanatory
  // comments already in page.tsx name all three identifiers.
  n++;
  const nc6 = src.replace(
    /const handleRefresh = useCallback\(/,
    "// refreshNonce refreshNonce notifyOrderPaid()\n  const __note = \"refreshNonce notifyOrderPaid()\";\n  const handleRefresh = useCallback(",
  );
  if (nc6 === src) fails.push("NC6: anchor drifted — could not plant the comment/string mention");
  else if (policyFails(nc6).length !== 0) {
    fails.push("NC6: a mention inside a comment/string was treated as a USE — this guard asserts prose, not code");
  }

  // NC7 — the stripper must not eat real code inside a template interpolation,
  // or genuine usages would silently go unchecked.
  n++;
  if (!/someIdent/.test(stripCommentsAndStrings("const a = `x${someIdent}y`;"))) {
    fails.push("NC7: the stripper discarded a ${...} interpolation, so real usages would go unchecked");
  }

  // NC8 — JSX prose must not be parsed as a call (`…cannot be assigned (…)`),
  // while a REAL call in the same shape still must be.
  n++;
  if (calledIdentifiers("<p>{n} cannot be assigned (unpaid, refunded).</p>").includes("assigned")) {
    fails.push("NC8: JSX prose is read as a call, which would report prose as a missing declaration");
  }
  if (!calledIdentifiers("void handleDirectLookup(ref);").includes("handleDirectLookup")) {
    fails.push("NC8: the prose filter swallowed a REAL call — the call rule is now blind");
  }
  if (!calledIdentifiers('if (o.status === "paid") notifyOrderPaid(o);').includes("notifyOrderPaid")) {
    fails.push("NC8: the prose filter swallowed the notifyOrderPaid call shape");
  }

  if (fails.length) {
    console.error(`${RED}✗ admin-orders runtime identifiers SELF-TEST FAILED${RESET} (${fails.length}/${n})`);
    for (const f of fails) console.error(`  ${RED}•${RESET} ${f}`);
    return 1;
  }
  console.log(`${GREEN}✓ admin-orders runtime identifiers self-test passed${RESET} (${n} negative controls)`);
  return 0;
}

const selfTest = process.argv.includes("--self-test");
let code = 0;
try {
  code |= runStatic();
  if (selfTest) code |= runSelfTest();
  if (code === 0) console.log(`${DIM}  contract: the admin portal cannot ship an identifier it does not define${RESET}`);
} catch (e) {
  console.error(`${RED}✗ admin-orders runtime identifiers guard error: ${e.message}${RESET}`);
  code = 1;
}
process.exit(code);
