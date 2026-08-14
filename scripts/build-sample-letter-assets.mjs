// scripts/build-sample-letter-assets.mjs
//
// QR-LETTER-VERIFICATION-AND-SAMPLE-PARITY-001 — published sample letters.
//
// THE DESIGN IS THE POLISHED SITE SAMPLE, NOT A QA WORKSHEET.
// An earlier revision replaced the site's polished sample with a generic
// "Sample Provider Name" document covered in explanatory text and a heavy
// diagonal banner. It was safe but it looked like a test fixture, and it is the
// first thing a visitor sees on the homepage and at checkout. This restores the
// original polished composition — orange top rule, provider header, clinical
// letter structure, recipient table, signature area, page proportions — and
// changes only what the verification work requires.
//
// WHAT CHANGED FROM THE ORIGINAL POLISHED SAMPLE
//   • The top-right "Verification ID" box is GONE. It printed the ID, the
//     pawtenant.com/verify URL and a "reserved injector area" note. Letters no
//     longer carry any of that, so a sample that shows it is advertising a
//     feature that does not exist. That corner is now clean whitespace.
//   • A discreet QR sits low on the right, above the footer rule, matching where
//     the injector places it on a real letter. No caption, no border, no ID, no
//     URL — the destination exists only inside the module geometry.
//   • Credentials are unmistakably illustrative: a reserved-for-fiction phone
//     range, an example.com address, and a licence number that could never be
//     issued. No NPI. Nothing is copied from any genuine letter.
//   • A restrained SAMPLE mark: one low-opacity diagonal and one footer line.
//
// THE URL CONTRACT is the finalised ID-only form:
//     https://pawtenant.com/verify/<VERIFICATION_ID>
// No token is involved anywhere in this build, so no secret can reach the
// repository, a build environment or a generated file.
//
//   node scripts/build-sample-letter-assets.mjs            → write assets
//   node scripts/build-sample-letter-assets.mjs --check    → verify only

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require_ = createRequire(import.meta.url);
const qrcode = require_("qrcode-generator");
const CHECK = process.argv.includes("--check");

const CFG = JSON.parse(readFileSync(resolve(ROOT, "scripts/sample-letter-demos.json"), "utf8"));

const DEMOS = {
  esa: { id: CFG.esa.id, url: `${CFG.verifyBase}/${CFG.esa.id}` },
  psd: { id: CFG.psd.id, url: `${CFG.verifyBase}/${CFG.psd.id}` },
};

// The page is 800 user units wide and stands for US Letter (8.5in), so
// 94.118 units = 1 inch.
const UNITS_PER_INCH = 800 / 8.5;
const QR_TARGET_IN = 0.85;                 // inside the owner's 0.75-0.9in band

const OUT = {
  esa: [
    "public/images/checkout/esa-sample-letter.svg",
    // Same bytes, second published path, served at
    // /assets/documents/esa-sample-letter.svg.
    "public/assets/documents/esa-sample-letter.svg",
  ],
  psd: ["public/images/checkout/psd-sample-letter.svg"],
};

/**
 * QR as vector <rect>s, sized so the CODE (excluding the quiet zone) prints at
 * `codeUnits`. Positioned by the code's BOTTOM-RIGHT corner so it lines up with
 * the letter's right text margin regardless of how many modules the URL needs.
 */
function qrSvg(text, codeRight, codeBottom, codeUnits) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  const unit = codeUnits / n;
  const plate = (n + quiet * 2) * unit;
  const codeX = codeRight - codeUnits;
  const codeY = codeBottom - codeUnits;
  const plateX = codeX - quiet * unit;
  const plateY = codeY - quiet * unit;

  let rects = "";
  for (let r = 0; r < n; r++) {
    let runStart = -1;
    for (let c = 0; c <= n; c++) {
      const dark = c < n && qr.isDark(r, c);
      if (dark && runStart === -1) runStart = c;
      if (!dark && runStart !== -1) {
        rects += `<rect x="${(codeX + runStart * unit).toFixed(2)}" y="${(codeY + r * unit).toFixed(2)}" width="${((c - runStart) * unit).toFixed(2)}" height="${unit.toFixed(2)}" fill="#000000"/>`;
        runStart = -1;
      }
    }
  }
  return {
    moduleCount: n,
    inches: codeUnits / UNITS_PER_INCH,
    plate: { x: plateX, y: plateY, size: plate },
    // Pure black on pure white, no border. The white plate IS the quiet zone.
    svg: `<rect x="${plateX.toFixed(2)}" y="${plateY.toFixed(2)}" width="${plate.toFixed(2)}" height="${plate.toFixed(2)}" fill="#ffffff"/>` + rects,
  };
}

const COPY = {
  esa: {
    aria: "Sample ESA letter — demonstration only",
    role: "Behavioral Health and Housing Accommodation",
    animalLabel: "Support Animal",
    animalValue: "Luna — Domestic Short-Hair Cat",
    purpose: "Housing accommodation (sample)",
    p1: [
      "I am a licensed therapist currently providing behavioral health services to Jordan Bennett, born March 18,",
      "1994. I have evaluated Jordan and determined that they have a mental health condition that substantially",
      "limits one or more major life activities within the meaning of applicable fair housing guidance.",
    ],
    p2: [
      "Based on my clinical evaluation and ongoing therapeutic relationship, I have determined that Jordan benefits",
      "from the presence of an Emotional Support Animal named Luna, a domestic short-hair cat. The animal",
      "provides emotional stabilization, reduces symptoms associated with the condition, and supports daily",
      "functioning in the home environment.",
    ],
    p3: [
      "In my professional opinion, the Emotional Support Animal is a necessary part of Jordan's treatment plan and",
      "helps alleviate disability-related symptoms. Because of that therapeutic benefit, reasonable accommodation",
      "for the animal in housing is clinically appropriate.",
    ],
  },
  psd: {
    aria: "Sample PSD letter — demonstration only",
    role: "Behavioral Health and Service Animal Assessment",
    animalLabel: "Service Dog",
    animalValue: "Scout — Task-Trained Dog",
    purpose: "Psychiatric service dog (sample)",
    p1: [
      "I am a licensed therapist currently providing behavioral health services to Jordan Bennett, born March 18,",
      "1994. I have evaluated Jordan and determined that they have a mental health condition that substantially",
      "limits one or more major life activities within the meaning of applicable guidance.",
    ],
    p2: [
      "Based on my clinical evaluation and ongoing therapeutic relationship, I have determined that Jordan benefits",
      "from a Psychiatric Service Dog named Scout. The dog is trained to perform specific tasks that mitigate the",
      "effects of the condition, including interruption of escalating symptoms and grounding assistance during",
      "periods of acute distress.",
    ],
    p3: [
      "In my professional opinion, the trained tasks this dog performs are a necessary part of Jordan's treatment",
      "plan and directly mitigate disability-related symptoms. The animal's presence is clinically appropriate in",
      "the settings where those tasks are required.",
    ],
  },
};

function buildSvg(kind) {
  const d = DEMOS[kind];
  const c = COPY[kind];
  const codeUnits = QR_TARGET_IN * UNITS_PER_INCH;
  // Low on the right, above the footer rule (y=950) and clear of the
  // signature block, which stays on the left. This mirrors the lower
  // bottom-right position the injector now prefers on a real letter.
  const qr = qrSvg(d.url, 744, 928, codeUnits);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1035" width="800" height="1035" role="img" aria-label="${c.aria}">
  <defs>
    <linearGradient id="paperShadow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f7f8fa"/>
    </linearGradient>
    <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="4"/>
      <feOffset dx="0" dy="3" result="off"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.15"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Page -->
  <rect x="20" y="20" width="760" height="995" rx="10" ry="10" fill="url(#paperShadow)" stroke="#e3e6ec" stroke-width="1" filter="url(#softShadow)"/>

  <!-- Top accent bar (PawTenant orange) -->
  <rect x="20" y="20" width="760" height="6" rx="3" ry="3" fill="#F26A21"/>

  <!-- Header: provider (left). The top-right corner is intentionally clean. -->
  <g font-family="Helvetica, Arial, sans-serif">
    <text x="56" y="78" font-size="19" font-weight="700" fill="#0f172a">Dr. Amelia Hart, PhD, LPC-S</text>
    <text x="56" y="100" font-size="12" fill="#475569">Licensed Professional Counselor, Licensed Therapist</text>
    <text x="56" y="118" font-size="12" fill="#475569">${c.role}</text>
    <text x="56" y="136" font-size="12" fill="#475569">Specialist</text>
  </g>

  <!-- Divider -->
  <line x1="56" y1="162" x2="744" y2="162" stroke="#e2e8f0" stroke-width="1"/>

  <!-- Letter meta block -->
  <g font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#1f2937">
    <text x="56" y="188">Dr. Amelia Hart</text>
    <text x="56" y="206">Licence #SAMPLE-NOT-ISSUABLE</text>
    <text x="56" y="224">April 10, 2026</text>
    <text x="56" y="242">To Whom It May Concern:</text>
  </g>

  <!-- Body paragraphs -->
  <g font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#1f2937">
    <text x="56" y="276">
      <tspan x="56" dy="0">${c.p1[0]}</tspan>
      <tspan x="56" dy="17">${c.p1[1]}</tspan>
      <tspan x="56" dy="17">${c.p1[2]}</tspan>
    </text>

    <text x="56" y="352">
      <tspan x="56" dy="0">${c.p2[0]}</tspan>
      <tspan x="56" dy="17">${c.p2[1]}</tspan>
      <tspan x="56" dy="17">${c.p2[2]}</tspan>
      <tspan x="56" dy="17">${c.p2[3]}</tspan>
    </text>

    <text x="56" y="445">
      <tspan x="56" dy="0">${c.p3[0]}</tspan>
      <tspan x="56" dy="17">${c.p3[1]}</tspan>
      <tspan x="56" dy="17">${c.p3[2]}</tspan>
    </text>

    <text x="56" y="521">
      <tspan x="56" dy="0">This letter is provided for accommodation purposes. To protect patient confidentiality, detailed</tspan>
      <tspan x="56" dy="17">diagnostic information is not included here. Verification of my professional credentials may be</tspan>
      <tspan x="56" dy="17">provided as permitted by law.</tspan>
    </text>
  </g>

  <!-- Recipient information table -->
  <g font-family="Helvetica, Arial, sans-serif" font-size="12">
    <rect x="56" y="590" width="220" height="120" fill="#f1f5f9"/>
    <rect x="56" y="590" width="688" height="120" fill="none" stroke="#cbd5e1" stroke-width="1"/>
    <line x1="276" y1="590" x2="276" y2="710" stroke="#cbd5e1"/>
    <line x1="56" y1="620" x2="744" y2="620" stroke="#cbd5e1"/>
    <line x1="56" y1="650" x2="744" y2="650" stroke="#cbd5e1"/>
    <line x1="56" y1="680" x2="744" y2="680" stroke="#cbd5e1"/>
    <g font-weight="700" fill="#0f172a">
      <text x="70" y="610">Patient Name</text>
      <text x="70" y="640">Date of Birth</text>
      <text x="70" y="670">${c.animalLabel}</text>
      <text x="70" y="700">Letter Purpose</text>
    </g>
    <g fill="#1f2937">
      <text x="290" y="610">Jordan Bennett</text>
      <text x="290" y="640">March 18, 1994</text>
      <text x="290" y="670">${c.animalValue}</text>
      <text x="290" y="700">${c.purpose}</text>
    </g>
  </g>

  <!-- Signature area -->
  <g font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#1f2937">
    <text x="56" y="748">Sincerely,</text>
  </g>
  <text x="56" y="798" font-family="'Brush Script MT', 'Segoe Script', cursive" font-size="34" font-style="italic" fill="#334155">Amelia Hart, PhD, LPC-S</text>
  <g font-family="Helvetica, Arial, sans-serif" font-size="11.5" fill="#334155">
    <text x="56" y="826" fill="#0f172a">Dr. Amelia Hart</text>
    <text x="56" y="844">Licensed Professional Counselor — Illustrative</text>
    <text x="56" y="862">Licence #SAMPLE-NOT-ISSUABLE</text>
    <text x="56" y="884">Phone: (555) 010-0000  |  Email: provider@example.com</text>
    <text x="56" y="902">Example Behavioral Health, Suite 210</text>
  </g>

  <!-- Verification QR — bare, uncaptioned, low on the right -->
  <g>${qr.svg}</g>

  <!-- Restrained SAMPLE mark -->
  <g transform="rotate(-24 400 470)" opacity="0.085">
    <text x="400" y="490" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="60" font-weight="700" letter-spacing="3" fill="#F26A21">SAMPLE</text>
  </g>

  <!-- Footer -->
  <g font-family="Helvetica, Arial, sans-serif" font-size="10">
    <line x1="56" y1="950" x2="744" y2="950" stroke="#e2e8f0"/>
    <text x="56" y="972" font-weight="700" fill="#F26A21" letter-spacing="0.6">SAMPLE — DEMONSTRATION ONLY</text>
    <text x="56" y="988" fill="#94a3b8">Illustrative document. No real patient, provider, licence or clinical assessment appears on this page.</text>
    <text x="744" y="972" text-anchor="end" fill="#64748b">Page 1 of 1</text>
  </g>
</svg>
`;
  return { svg, qr };
}

let failed = 0;
for (const kind of ["esa", "psd"]) {
  const { svg, qr } = buildSvg(kind);
  if (qr.inches < 0.75 || qr.inches > 0.9) {
    console.error(`FAIL ${kind}: QR prints at ${qr.inches.toFixed(3)}in, outside 0.75-0.90in`);
    failed++;
  }
  for (const rel of OUT[kind]) {
    const path = resolve(ROOT, rel);
    if (CHECK) {
      const same = readFileSync(path, "utf8") === svg;
      if (!same) failed++;
      console.log(`${same ? "OK   " : "STALE"} ${rel} (QR ${qr.moduleCount} modules, ${qr.inches.toFixed(3)}in)`);
    } else {
      writeFileSync(path, svg, "utf8");
      console.log(`wrote ${rel} — ${svg.length} chars, QR ${qr.moduleCount} modules, ${qr.inches.toFixed(3)}in`);
    }
  }
}
process.exit(failed === 0 ? 0 : 1);
