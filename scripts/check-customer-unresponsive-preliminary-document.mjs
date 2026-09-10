#!/usr/bin/env node
import fs from "node:fs";
const read = (p) => fs.readFileSync(p, "utf8");
const f = {
 modal: read("src/pages/admin-orders/components/OrderDetailModal.tsx"),
 docs: read("src/lib/customerDocuments.ts"),
 card: read("src/pages/my-orders/components/LetterDeliveryCard.tsx"),
 lifecycle: read("src/pages/my-orders/components/OrderLifecycle.tsx"),
 page: read("src/pages/my-orders/page.tsx"),
 upload: read("supabase/functions/admin-upload-document/index.ts"),
 notify: read("supabase/functions/notify-order-status/index.ts"),
 migration: read("supabase/migrations/20260910190000_customer_unresponsive_preliminary_document.sql"),
};
let failed=0; const check=(n,ok)=>{if(!ok)failed++;console.log(`${ok?"PASS":"FAIL"} ${n}`)};
check("real file input",/type="file"/.test(f.modal));
check("authenticated upload endpoint",/functions\/v1\/admin-upload-document/.test(f.modal)&&/Authorization: `Bearer/.test(f.modal));
check("explicit preliminary type",/preliminary_document/.test(f.modal)&&/"preliminary_document"/.test(f.upload));
check("consultation follow-up action",/Send Follow-up Consultation Request/.test(f.modal)&&/handleSendConsultationInvite/.test(f.modal));
check("audited force-complete action",/Review &amp; Mark Complete/.test(f.modal)&&/openForceComplete/.test(f.modal));
check("independent preliminary portal card",/d\.doc_type === "preliminary_document"/.test(f.docs)&&/hasPreliminary/.test(f.docs));
check("truthful portal copy",/It is not your final ESA\/PSD letter/.test(f.card));
check("banner requires final letter",/hasFinalCustomerDocument\(order\)/.test(f.page));
check("lifecycle requires final letter",/hasFinalCustomerDocument\(order\)/.test(f.lifecycle));
check("server excludes preliminary",/d\.doc_type <> 'preliminary_document'/.test(f.migration));
check("notifier excludes preliminary",/\.neq\("doc_type", "preliminary_document"\)/.test(f.notify));
check("private signed-link upload",/\.from\("letters"\)[\s\S]*\.upload\(/.test(f.upload)&&/createSignedUrl/.test(f.upload));
check("no payout or letter manufacture",!/doctor_earnings/.test(f.upload)&&!/letter_id/.test(f.upload));
if(process.argv.includes("--self-test")){const broken=f.page.replaceAll("hasFinalCustomerDocument","hasCustomerDeliverable");check("negative control: broad banner",!/hasFinalCustomerDocument\(order\)/.test(broken))}
if(failed)process.exit(1);

