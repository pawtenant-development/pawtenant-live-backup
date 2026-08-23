#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL("..", import.meta.url)));
const FILES = {
  helper: "supabase/functions/_shared/customerPasswordRecovery.ts",
  request: "supabase/functions/request-customer-password-reset/index.ts",
  send: "supabase/functions/send-customer-password-reset/index.ts",
  preboot: "index.html",
  page: "src/pages/reset-password/page.tsx",
};

const load = async () => Object.fromEntries(await Promise.all(
  Object.entries(FILES).map(async ([key, path]) => [key, await readFile(join(ROOT, path), "utf8")]),
));

function inspect(src) {
  const failures = [];
  const must = (condition, label) => { if (!condition) failures.push(label); };

  must(src.helper.includes("landing.hash = `recovery_link=${encoded}`"), "wrapper uses fragment credential");
  must(src.helper.includes("action.pathname !== \"/auth/v1/verify\"") && src.helper.includes("type\") !== \"recovery\""), "wrapper validates recovery action");
  must(src.request.includes("10 * 60_000"), "self-service reset resists rapid supersession");
  must(src.request.includes('"https://pawtenant.com/reset-password"') && !src.request.includes('"https://www.pawtenant.com/reset-password"'), "canonical LIVE reset host");
  must(src.request.includes("buildScannerSafeRecoveryUrl(actionLink, RESET_REDIRECT)"), "self-service email uses safe wrapper");
  must(src.send.includes("buildScannerSafeRecoveryUrl(actionLink, RESET_REDIRECT)"), "admin/welcome email uses safe wrapper");
  must(!/href="\$\{actionLink\}"/.test(src.request) && !/href="\$\{actionLink\}"/.test(src.send), "emails never expose direct action link");
  must(src.preboot.includes("__PT_PASSWORD_RECOVERY_LINK__") && src.preboot.includes("replaceState({}, '', window.location.pathname + window.location.search)"), "preboot stashes and scrubs before app boot");
  const start = src.preboot.indexOf("Password recovery credential");
  const recoveryBlock = src.preboot.slice(start, src.preboot.indexOf("(function()", start));
  must(recoveryBlock && !/localStorage|sessionStorage/.test(recoveryBlock), "recovery credential is memory-only");
  must(src.page.includes('action.origin !== expectedOrigin') && src.page.includes('action.pathname !== "/auth/v1/verify"') && src.page.includes('action.searchParams.get("type") !== "recovery"'), "reset page validates trusted Supabase recovery URL");
  must(src.page.includes("onClick={continueRecovery}") && src.page.includes("window.location.assign(pendingRecoveryLink)"), "only explicit Continue action follows token");
  must(src.page.includes('event === "PASSWORD_RECOVERY"') && src.page.includes("exchangeCodeForSession(code)"), "existing recovery and PKCE handling preserved");
  return failures;
}

async function runReal() {
  const failures = inspect(await load());
  if (failures.length) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log("PASS customer password recovery guard (12/12)");
}

async function runSelfTest() {
  const baseline = await load();
  const plants = [
    ["direct email token", "request", "${safeRecoveryLink}", "${actionLink}"],
    ["admin direct token", "send", "${safeRecoveryLink}", "${actionLink}"],
    ["no scanner wrapper", "helper", "recovery_link", "recovery_token"],
    ["wrong reset host", "request", "https://pawtenant.com/reset-password", "https://www.pawtenant.com/reset-password"],
    ["one-minute supersession", "request", "10 * 60_000", "60_000"],
    ["credential not scrubbed", "preboot", "window.history.replaceState({}, '', window.location.pathname + window.location.search);", "void 0;"],
    ["persistent credential", "preboot", "window.__PT_PASSWORD_RECOVERY_LINK__ = new TextDecoder().decode(bytes);", "localStorage.setItem('recovery', new TextDecoder().decode(bytes));"],
    ["origin validation removed", "page", "action.origin !== expectedOrigin ||", "false ||"],
    ["path validation removed", "page", 'action.pathname !== "/auth/v1/verify" ||', "false ||"],
    ["type validation removed", "page", 'action.searchParams.get("type") !== "recovery"', "false"],
    ["explicit click removed", "page", "onClick={continueRecovery}", "onClick={() => undefined}"],
    ["legacy recovery removed", "page", 'event === "PASSWORD_RECOVERY"', 'event === "IGNORED"'],
  ];
  let caught = 0;
  for (const [name, key, from, to] of plants) {
    const planted = { ...baseline };
    if (!planted[key].includes(from)) throw new Error(`NO-OP plant: ${name}`);
    planted[key] = planted[key].replace(from, to);
    if (inspect(planted).length > 0) caught++;
    else console.error(`MISSED ${name}`);
  }
  if (caught !== plants.length) process.exitCode = 1;
  else console.log(`PASS planted negative controls (${caught}/${plants.length})`);
}

if (process.argv.includes("--self-test")) await runSelfTest();
else await runReal();
