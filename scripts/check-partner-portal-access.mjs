#!/usr/bin/env node
import fs from "node:fs";

const FILES = {
  invite: "supabase/functions/partner-user-invite/index.ts",
  reset: "src/pages/reset-password/page.tsx",
  hosts: "src/lib/subdomainConfig.ts",
  routes: "src/router/portalRoutes.tsx",
  app: "src/App.tsx",
};

function readSources() {
  return Object.fromEntries(Object.entries(FILES).map(([key, path]) => [key, fs.readFileSync(path, "utf8")]));
}

function assertions(source) {
  return [
    ["partner email is PawTenant branded", /Partner Portal Invitation/.test(source.invite) && /pawtenant-logo-white-02\.png/.test(source.invite)],
    ["partner email has a clear password CTA", /Set My Password/.test(source.invite)],
    ["Supabase default invitation email is not used", !/inviteUserByEmail/.test(source.invite)],
    ["branded delivery uses Resend", /api\.resend\.com\/emails/.test(source.invite) && /branded_email_sent/.test(source.invite)],
    ["invites and recoveries both use generated action links", /type: "invite"/.test(source.invite) && /type: "recovery"/.test(source.invite) && /action_link/.test(source.invite)],
    ["one-time setup credential is scanner-safe", /landing\.hash = `recovery_link=\$\{encoded\}`/.test(source.invite) && /\/auth\/v1\/verify/.test(source.invite)],
    ["TEST notification suppression remains before mail delivery", source.invite.lastIndexOf("const suppression = evaluateNotificationSuppression") >= 0 && source.invite.lastIndexOf("const suppression = evaluateNotificationSuppression") < source.invite.lastIndexOf("const sent = await sendPartnerInviteEmail")],
    ["TEST invitation links stay on the TEST web deployment", /isTestProject\(\)/.test(source.invite) && /https:\/\/pawtenant-test\.vercel\.app/.test(source.invite)],
    ["partner reset accepts membership before staff lookup", source.reset.includes("partner_portal_accept_invitation") && source.reset.indexOf("partner_portal_accept_invitation") < source.reset.indexOf('.from("doctor_profiles")')],
    ["partner reset keeps the authenticated session", /navigate\("\/partner-portal\?passwordReset=success"/.test(source.reset) && source.reset.indexOf("partner_portal_accept_invitation") < source.reset.indexOf("supabase.auth.signOut")],
    ["reset validation accepts invite and recovery action types", /get\("type"\) !== "recovery"/.test(source.reset) && /get\("type"\) !== "invite"/.test(source.reset)],
    ["expired-link UI offers partner sign in", /Partner Sign In/.test(source.reset) && /to="\/partner-portal"/.test(source.reset)],
    ["three dedicated hostnames are exact constants", /admin\.pawtenant\.com/.test(source.hosts) && /customer\.pawtenant\.com/.test(source.hosts) && /partner\.pawtenant\.com/.test(source.hosts)],
    ["hostname routing does not use a production feature toggle", /switch \(window\.location\.hostname\.toLowerCase\(\)\)/.test(source.hosts) && !/SUBDOMAIN_ENABLED/.test(source.hosts)],
    ["partner hostname exposes only partner auth routes", /PartnerSubdomainRoutes/.test(source.routes) && /Navigate to="\/partner-portal"/.test(source.routes)],
    ["customer hostname exposes customer portal and checkout routes", /CustomerSubdomainRoutes/.test(source.routes) && /path="\/my-orders"/.test(source.routes) && /path="\/checkout\/:slug"/.test(source.routes)],
    ["App selects dedicated shells before the public site", /const portalHostname = getPortalHostname\(\)/.test(source.app) && /return <DedicatedPortalApp portal=\{portalHostname\}/.test(source.app) && source.app.indexOf('portalHostname === "partner"') < source.app.lastIndexOf("<GeoGate>")],
  ];
}

function run(source, quiet = false) {
  const results = assertions(source);
  const failed = results.filter(([, ok]) => !ok);
  if (!quiet) {
    for (const [name, ok] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  }
  return failed;
}

const source = readSources();
if (process.argv.includes("--self-test")) {
  const controls = [
    ["plain Supabase invite", s => s.invite = s.invite.replace("api.resend.com/emails", "mail.invalid")],
    ["missing CTA", s => s.invite = s.invite.replace("Set My Password", "Continue")],
    ["default Auth mail restored", s => s.invite += "\ninviteUserByEmail(email)"],
    ["scanner wrapper removed", s => s.invite = s.invite.replace("landing.hash = `recovery_link=${encoded}`", "return actionLink")],
    ["suppression moved after mail", s => s.invite = s.invite.replace("const suppression = evaluateNotificationSuppression", "const suppression = z_evaluateNotificationSuppression")],
    ["TEST link leaks to public site", s => s.invite = s.invite.replace("https://pawtenant-test.vercel.app", "https://pawtenant.com")],
    ["partner binding removed", s => s.reset = s.reset.replace("partner_portal_accept_invitation", "missing_partner_binding")],
    ["invite validation removed", s => s.reset = s.reset.replace('action.searchParams.get("type") !== "invite"', "false")],
    ["partner host removed", s => s.hosts = s.hosts.replace("partner.pawtenant.com", "pawtenant.com")],
    ["customer orders route removed", s => s.routes = s.routes.replace('path="/my-orders"', 'path="/orders-missing"')],
    ["public shell wins", s => s.app = s.app.replace("const portalHostname = getPortalHostname()", "const portalHostname = null")],
  ];
  let detected = 0;
  for (const [name, mutate] of controls) {
    const planted = structuredClone(source);
    mutate(planted);
    if (run(planted, true).length) detected++;
    else console.error(`CONTROL MISSED  ${name}`);
  }
  console.log(`${detected}/${controls.length} planted controls detected`);
  if (detected !== controls.length) process.exit(1);
}

if (run(source).length) process.exit(1);
