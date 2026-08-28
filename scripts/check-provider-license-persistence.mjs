import fs from "node:fs";

const panelPath = "src/pages/provider-portal/components/ProviderLicensePanel.tsx";
const drawerPath = "src/pages/admin-orders/components/ProviderDrawer.tsx";
const doctorsPath = "src/pages/admin-orders/components/DoctorsTab.tsx";

const sources = {
  panel: fs.readFileSync(panelPath, "utf8"),
  drawer: fs.readFileSync(drawerPath, "utf8"),
  doctors: fs.readFileSync(doctorsPath, "utf8"),
};

function failures(input) {
  const out = [];
  const require = (ok, label) => { if (!ok) out.push(label); };

  require(input.panel.includes("loadLatestLicenseSnapshot"), "fresh durable snapshot helper");
  require(input.panel.includes("persistLicenseSnapshot"), "verified persistence helper");
  require(input.panel.includes('.select("state_license_numbers, licensed_states")\n      .single()'), "updated row must be returned");
  require(!input.panel.includes('.from("doctor_contacts").update({'), "provider must not write admin-only contact copy");
  require((input.panel.match(/await loadLatestLicenseSnapshot\(\)/g) ?? []).length === 3, "all three license mutations start fresh");
  require((input.panel.match(/await persistLicenseSnapshot\(/g) ?? []).length === 3, "all three license mutations verify persistence");
  require(input.drawer.includes("doc?.profile?.licensed_states ?? doc?.contact?.licensed_states"), "drawer profile-first state source");
  require((input.doctors.match(/profile\?\.licensed_states \?\? contact\?\.licensed_states/g) ?? []).length >= 1, "coverage profile-first state source");
  require((input.doctors.match(/doc\.profile\?\.licensed_states \?\? doc\.contact\?\.licensed_states/g) ?? []).length >= 3, "roster profile-first state sources");
  require(input.doctors.includes("statesModalDoc.profile?.licensed_states ?? statesModalDoc.contact?.licensed_states"), "state editor profile-first source");

  return out;
}

const liveFailures = failures(sources);
if (liveFailures.length) {
  console.error(`Provider license persistence guard failed:\n- ${liveFailures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--self-test")) {
  const controls = [
    (s) => ({ ...s, panel: s.panel.replaceAll("loadLatestLicenseSnapshot", "loadCachedLicenseSnapshot") }),
    (s) => ({ ...s, panel: s.panel.replaceAll("persistLicenseSnapshot", "persistUncheckedSnapshot") }),
    (s) => ({ ...s, panel: s.panel.replace('.select("state_license_numbers, licensed_states")\n      .single()', "") }),
    (s) => ({ ...s, panel: `${s.panel}\n.from(\"doctor_contacts\").update({ licensed_states: [] })` }),
    (s) => ({ ...s, panel: s.panel.replace("await loadLatestLicenseSnapshot()", "profile") }),
    (s) => ({ ...s, panel: s.panel.replace("await persistLicenseSnapshot(", "Promise.resolve(") }),
    (s) => ({ ...s, drawer: s.drawer.replace("doc?.profile?.licensed_states ?? doc?.contact?.licensed_states", "doc?.contact?.licensed_states ?? doc?.profile?.licensed_states") }),
    (s) => ({ ...s, doctors: s.doctors.replaceAll("doc.profile?.licensed_states ?? doc.contact?.licensed_states", "doc.contact?.licensed_states ?? doc.profile?.licensed_states") }),
  ];
  const missed = controls.map((mutate, i) => failures(mutate(sources)).length ? null : i + 1).filter(Boolean);
  if (missed.length) {
    console.error(`Provider license persistence negative controls missed: ${missed.join(", ")}`);
    process.exit(1);
  }
  console.log(`${controls.length}/${controls.length} provider license negative controls detected.`);
}

console.log("Provider license persistence guard passed.");
