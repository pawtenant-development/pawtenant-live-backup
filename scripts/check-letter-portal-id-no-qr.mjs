// LETTER-PORTAL-ID-NO-QR-001
// Static safety contract: verification remains available by portal ID, while
// clinical PDFs and service promises contain no embedded ID/QR behavior.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = process.argv.includes("--self-test");
const WARN = process.argv.includes("--warn-only");
const F = {
  submit: "supabase/functions/provider-submit-letter/index.ts",
  inject: "supabase/functions/inject-pdf-footer/index.ts",
  generate: "supabase/functions/generate-qr-verification-pdf/index.ts",
  repair: "supabase/functions/repair-order-letter-id/index.ts",
  issue: "supabase/functions/issue-letter-verification/index.ts",
  notify: "supabase/functions/notify-patient-letter/index.ts",
  card: "src/pages/my-orders/components/MyDocumentsCard.tsx",
  portal: "src/pages/my-orders/page.tsx",
  plans: "src/data/planPricingCards.ts",
};
const MARKETING = [
  "src/components/feature/LandlordVerificationBadge.tsx",
  "src/components/feature/PrivacySafeVerificationNote.tsx",
  "src/components/feature/VerificationPillarsSection.tsx",
  "src/components/feature/VerificationTrustCard.tsx",
  "src/pages/esa-letter-verification-id/page.tsx",
  "src/pages/esa-letter-verification/page.tsx",
  "src/pages/faqs/page.tsx",
  "src/pages/home/components/FAQSection.tsx",
  "src/pages/home/components/LandlordSupportSection.tsx",
  "src/pages/home/components/LetterProofSection.tsx",
  "src/pages/home/components/StepsSection.tsx",
  "src/pages/how-to-verify-esa-letter/page.tsx",
  "src/pages/is-pawtenant-legit/page.tsx",
  "src/pages/landlord-says-esa-letter-is-fake/page.tsx",
  "src/pages/verify-result/page.tsx",
  "src/pages/verifiable-esa-letters/page.tsx",
  "src/pages/what-makes-esa-letter-valid/page.tsx",
  "src/mocks/blogPostsVerification.ts",
  "src/config/seoConfig.ts",
  "src/pages/state-esa/page.tsx",
  "src/pages/home/components/Navbar.tsx"
];
const SAMPLES = [
  "public/assets/documents/esa-letter-sample.jpg",
  "public/assets/documents/esa-sample-letter.svg",
  "public/images/checkout/esa-sample-letter.svg",
  "public/images/checkout/psd-sample-letter.svg",
  "scripts/build-sample-letter-assets.mjs",
  "scripts/check-sample-letter-assets.mjs",
  "scripts/sample-letter-demos.json",
  "src/components/feature/SampleLetterCard.tsx",
];
const read=(p,o={})=>o[p] ?? readFileSync(resolve(ROOT,p),"utf8");
function checks(o={}){
 const s=read(F.submit,o), i=read(F.inject,o), g=read(F.generate,o), r=read(F.repair,o);
 const issue=read(F.issue,o), n=read(F.notify,o), c=read(F.card,o), p=read(F.portal,o), plans=read(F.plans,o);
 const marketing=MARKETING.map(x=>read(x,o)).join("\n");
 const out=[]; const add=(id,desc,ok)=>out.push({id,desc,ok:!!ok});
 add("N1","provider submission issues an ID but never mutates the PDF",
   /generateVerificationId/.test(s) && /const finalUrl = documentUrl;/.test(s) &&
   !/buildQrVerificationPdf|injectPdfVerification/.test(s));
 add("N2","provider response explicitly reports no injected/processed PDF",
   /pdfFooterInjected:\s*false/.test(s) && /processedPdfUrl:\s*null/.test(s));
 add("N3","legacy stamping endpoints are retired before any PDF/storage work",
   [i,g].every(x=>/(?:status:\s*410|},\s*410\);)/.test(x) && /pdf_verification_stamping_retired/.test(x) &&
     !/pdf-lib|storage\.from|buildQrVerificationPdf/.test(x)));
 add("N4","repair only backfills IDs and modifies zero PDFs",
   /documentsProcessed:\s*0/.test(r) && /modified \$\{totalDocs\} PDFs/.test(r) &&
   !/pdf-lib|injectPdf|processed_file_url|drawText/.test(r));
 add("N5","customer delivery email always selects provider original",
   /const resolveUrl = \(doc: OrderDoc\): string => doc\.file_url;/.test(n));
 add("N6","portal exposes one plain letter download and no processed-copy option",
   /Download Letter/.test(c) && /doc\.originalDownload/.test(c) &&
   !/verificationDownload|QR-verified|qr-code/.test(c));
 add("N7","portal verification ID is clickable and shareable",
   /Verification ID/.test(c) && /\/verify\/\$\{encodeURIComponent\(doc\.verificationId\)\}/.test(c) &&
   /share this ID with your landlord/.test(c));
 add("N8","ESA and PSD portal records can link directly to manual verification",
   /const showVerify = delivered && !!order\.letter_id;/.test(p) &&
   /\/verify\/\$\{encodeURIComponent\(order\.letter_id!\)\}/.test(p) &&
   !/qr-code|verification QR/i.test(p));
 add("N9","all four service plans promise portal ID, never QR-on-letter",
   (plans.match(/Verification ID in your customer portal/g)||[]).length===4 &&
   !/\bQR\b|scan-to-verify/i.test(plans));
 add("N10","public marketing has no QR or scan-to-verify service claim",
   !/\bQR\b|scan-to-verify/i.test(marketing) &&
   !/verification ID (?:on|printed on|embedded in) (?:the|your|every|a) letter/i.test(marketing));
 add("N11","ID issuer remains ID-only",
   /generate_letter_verification_id/.test(issue) &&
   !/pdf-lib|processed_file_url|drawText|buildQrVerificationPdf/.test(issue));
 add("N12","sample-letter assets and their dedicated component remain present",
   SAMPLES.every(x=>existsSync(resolve(ROOT,x))));
 return out;
}
const base={};
for(const p of [...Object.values(F),...MARKETING]) base[p]=read(p);
const controls=[
 ["N1",o=>({...o,[F.submit]:o[F.submit].replace("const finalUrl = documentUrl;","const finalUrl = pdfInjectionResult.processedUrl || documentUrl;")})],
 ["N2",o=>({...o,[F.submit]:o[F.submit].replace("pdfFooterInjected: false,\n      processedPdfUrl: null","pdfFooterInjected: true,\n      processedPdfUrl: \"stamped.pdf\"")})],
 ["N3",o=>({...o,[F.inject]:o[F.inject].replace("}, 410);","}, 200);")})],
 ["N4",o=>({...o,[F.repair]:o[F.repair].replace("documentsProcessed: 0","documentsProcessed: 1")})],
 ["N5",o=>({...o,[F.notify]:o[F.notify].replace("=> doc.file_url;","=> doc.processed_file_url || doc.file_url;")})],
 ["N6",o=>({...o,[F.card]:o[F.card].replace("Download Letter","Download QR-verified copy")})],
 ["N7",o=>({...o,[F.card]:o[F.card].replace("/verify/${encodeURIComponent(doc.verificationId)}","/esa-letter-verification")})],
 ["N8",o=>({...o,[F.portal]:o[F.portal].replace("delivered && !!order.letter_id","delivered && !isPSDOrder(order)")})],
 ["N9",o=>({...o,[F.plans]:o[F.plans].replace("Verification ID in your customer portal","Scan-to-verify QR code on the letter")})],
 ["N10",o=>({...o,[MARKETING[0]]:o[MARKETING[0]]+"\nEvery letter has a QR code."})],
 ["N11",o=>({...o,[F.issue]:o[F.issue]+"\nconst processed_file_url = true;"})],
];
const result=checks();
console.log("LETTER-PORTAL-ID-NO-QR-001");
for(const x of result) console.log(`${x.ok?"✓":"✗"} ${x.id} ${x.desc}`);
let failed=result.filter(x=>!x.ok);
if(SELF){
 let caught=0;
 for(const [id,mutate] of controls){
   const patched=mutate({...base});
   const row=checks(patched).find(x=>x.id===id);
   const ok=row && !row.ok;
   console.log(`${ok?"✓":"✗"} control ${id}`);
   if(ok)caught++;
 }
 console.log(`${caught}/${controls.length} negative controls caught`);
 if(caught!==controls.length)failed.push({id:"SELF",desc:"negative controls",ok:false});
}
if(failed.length){
 console.error(`FAILED: ${failed.map(x=>x.id).join(", ")}`);
 if(!WARN)process.exit(1);
}
