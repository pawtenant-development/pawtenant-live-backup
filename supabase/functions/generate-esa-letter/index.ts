import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const GHL_PROXY_URL = `${SUPABASE_URL}/functions/v1/ghl-webhook-proxy`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AssessmentAnswers = {
  conditions?: string[];
  emotionalFrequency?: string;
  hasESA?: string;
  housingType?: string;
  petType?: string;
  challengeDuration?: string;
};

type OrderRow = {
  id: string;
  confirmation_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  state: string | null;
  selected_provider: string | null;
  plan_type: string | null;
  delivery_speed: string | null;
  price: number | null;
  status: string | null;
  assessment_answers: AssessmentAnswers | null;
};

function drawWrappedText(
  page: ReturnType<PDFDocument["addPage"]>,
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  fontSize: number,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  lineHeight: number,
  color = rgb(0.15, 0.15, 0.15),
): number {
  const words = text.split(" ");
  let line = "";
  let y = startY;
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(testLine, fontSize) > maxWidth && line) {
      page.drawText(line, { x, y, size: fontSize, font, color });
      y -= lineHeight;
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) {
    page.drawText(line, { x, y, size: fontSize, font, color });
    y -= lineHeight;
  }
  return y;
}

async function buildEsaLetterPdf(order: OrderRow): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();

  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const italic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const brandGreen = rgb(0.102, 0.361, 0.31);
  const darkText = rgb(0.1, 0.1, 0.1);
  const mutedText = rgb(0.45, 0.45, 0.45);
  const lightGray = rgb(0.87, 0.87, 0.87);

  const M = 55;
  const maxW = width - M * 2;
  const lh = 18;

  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const firstName = order.first_name ?? "";
  const lastName = order.last_name ?? "";
  const fullName = `${firstName} ${lastName}`.trim() || "Patient";
  const state = order.state ?? "Unknown";
  const provider = order.selected_provider ?? "Your Licensed Mental Health Professional";
  const answers = order.assessment_answers ?? {};
  const conditions =
    Array.isArray(answers.conditions) && answers.conditions.length > 0
      ? answers.conditions.join(", ")
      : null;

  page.drawRectangle({ x: 0, y: height - 75, width, height: 75, color: brandGreen });
  page.drawText("PawTenant", { x: M, y: height - 45, size: 26, font: bold, color: rgb(1, 1, 1) });
  page.drawText("EMOTIONAL SUPPORT ANIMAL LETTER", { x: M, y: height - 63, size: 9, font: regular, color: rgb(0.8, 0.95, 0.9) });
  const siteText = "pawtenant.com";
  const siteW = regular.widthOfTextAtSize(siteText, 9);
  page.drawText(siteText, { x: width - M - siteW, y: height - 55, size: 9, font: italic, color: rgb(0.8, 0.95, 0.9) });

  let curY = height - 105;

  page.drawText(`Date: ${dateStr}`, { x: M, y: curY, size: 10, font: regular, color: darkText });
  const refText = `Order: ${order.confirmation_id}`;
  const refW = regular.widthOfTextAtSize(refText, 10);
  page.drawText(refText, { x: width - M - refW, y: curY, size: 10, font: regular, color: mutedText });
  curY -= 6;

  page.drawLine({ start: { x: M, y: curY }, end: { x: width - M, y: curY }, thickness: 0.5, color: lightGray });
  curY -= 22;

  page.drawText("To Whom It May Concern,", { x: M, y: curY, size: 11, font: bold, color: darkText });
  curY -= lh + 6;

  const p1 = `I, ${provider}, am a licensed mental health professional currently providing therapeutic care to ${fullName}, a resident of the state of ${state}. This letter is issued to confirm that ${fullName} is currently under my professional care and has been evaluated in accordance with the Diagnostic and Statistical Manual of Mental Disorders (DSM-5). Based on my clinical assessment, ${fullName} has been diagnosed with a recognized mental or emotional disability.`;
  curY = drawWrappedText(page, p1, M, curY, maxW, 11, regular, lh) - 8;

  const conditionClause = conditions ? ` including, but not limited to, ${conditions},` : "";
  const p2 = `${fullName} experiences symptoms${conditionClause} which substantially limit one or more major life activities. It is my professional opinion that an Emotional Support Animal (ESA) is a necessary component of ${fullName}'s ongoing treatment plan. The companionship and emotional support provided by their ESA measurably alleviates the severity of their symptoms and is integral to their mental and emotional wellbeing.`;
  curY = drawWrappedText(page, p2, M, curY, maxW, 11, regular, lh) - 8;

  const p3 = `Pursuant to the Fair Housing Act (42 U.S.C. §§ 3601-3619), Section 504 of the Rehabilitation Act of 1973, and the Americans with Disabilities Act (ADA), I respectfully request that ${fullName} be granted a reasonable accommodation to reside with their Emotional Support Animal in their dwelling — regardless of any "no pets" policy in effect. Denying this accommodation would constitute a violation of federal fair housing law.`;
  curY = drawWrappedText(page, p3, M, curY, maxW, 11, regular, lh) - 8;

  const p4 = `Please do not hesitate to contact our office with any questions or requests for verification regarding this letter. We are committed to responding promptly to ensure ${fullName} can secure appropriate housing with their ESA.`;
  curY = drawWrappedText(page, p4, M, curY, maxW, 11, regular, lh) - 18;

  page.drawText("Sincerely,", { x: M, y: curY, size: 11, font: regular, color: darkText });
  curY -= 30;

  page.drawLine({ start: { x: M, y: curY }, end: { x: M + 230, y: curY }, thickness: 0.75, color: rgb(0.3, 0.3, 0.3) });
  curY -= 14;
  page.drawText(provider, { x: M, y: curY, size: 11, font: bold, color: darkText });
  curY -= 16;
  page.drawText("Licensed Mental Health Professional", { x: M, y: curY, size: 10, font: regular, color: mutedText });
  curY -= 16;
  page.drawText(`Licensed in: ${state}`, { x: M, y: curY, size: 10, font: regular, color: mutedText });
  curY -= 16;
  page.drawText(`Issued for: ${fullName}  |  Ref: ${order.confirmation_id}`, { x: M, y: curY, size: 9, font: italic, color: mutedText });

  const boxY = 78;
  page.drawRectangle({ x: M, y: boxY, width: maxW, height: 44, color: rgb(0.97, 0.97, 0.97), borderColor: lightGray, borderWidth: 0.5 });
  page.drawText("IMPORTANT:", { x: M + 8, y: boxY + 30, size: 8, font: bold, color: rgb(0.5, 0.3, 0.1) });
  const disclaimer = "This letter is issued by a licensed mental health professional based on a clinical evaluation. It is intended solely as documentation of an ESA need under federal fair housing law.";
  drawWrappedText(page, disclaimer, M + 8, boxY + 18, maxW - 16, 8, regular, 11, rgb(0.4, 0.4, 0.4));

  page.drawLine({ start: { x: M, y: 70 }, end: { x: width - M, y: 70 }, thickness: 0.5, color: lightGray });
  page.drawText("PawTenant  ·  hello@pawtenant.com  ·  (409) 965-5885  ·  pawtenant.com", { x: M, y: 55, size: 8, font: regular, color: mutedText });
  const pageLabel = "Page 1 of 1";
  const pageLabelW = regular.widthOfTextAtSize(pageLabel, 8);
  page.drawText(pageLabel, { x: width - M - pageLabelW, y: 55, size: 8, font: regular, color: mutedText });

  return pdfDoc.save();
}

// ── Notify GHL that the PDF is ready — now includes phone ────────────────────
async function notifyGhlLetterReady(order: OrderRow, letterUrl: string): Promise<void> {
  try {
    await fetch(GHL_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({
        webhookType: "assessment",
        email: order.email,
        firstName: order.first_name ?? "",
        lastName: order.last_name ?? "",
        phone: order.phone ?? "",
        confirmationId: order.confirmation_id,
        leadStatus: "ESA Letter Generated – Ready for Download",
        letterUrl,
        letterReadyAt: new Date().toISOString(),
        tags: ["ESA Letter Ready", "PDF Generated"],
      }),
    });
  } catch {
    // Silently fail — PDF is already saved, GHL notification is best-effort
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let confirmationId: string | undefined;
  try {
    const body = (await req.json()) as { confirmationId?: string };
    confirmationId = body.confirmationId;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (!confirmationId) {
    return new Response(JSON.stringify({ error: "confirmationId is required" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("*")
    .eq("confirmation_id", confirmationId)
    .maybeSingle();

  if (fetchError || !order) {
    return new Response(
      JSON.stringify({ error: fetchError?.message ?? "Order not found" }),
      { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await buildEsaLetterPdf(order as OrderRow);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "PDF generation failed";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  const fileName = `${confirmationId}-esa-letter.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("letters")
    .upload(fileName, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    return new Response(
      JSON.stringify({ error: `Storage upload failed: ${uploadError.message}` }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  const { data: publicUrlData } = supabase.storage.from("letters").getPublicUrl(fileName);
  const letterUrl = publicUrlData.publicUrl;

  // Intentionally no write to `orders.letter_url` — that column is invalid and
  // only `signed_letter_url` (set by provider-submit-letter) is the source of
  // truth for a finalized letter. The PDF is uploaded to storage and returned
  // to the caller; order status/letter fields are not mutated here.

  await notifyGhlLetterReady(order as OrderRow, letterUrl);

  return new Response(
    JSON.stringify({ ok: true, letterUrl }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
});
