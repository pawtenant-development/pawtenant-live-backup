// generate-qr-verification-pdf
// LETTER-PORTAL-ID-NO-QR-001: retired. Verification IDs remain portal/manual-lookup records;
// clinical PDFs are never stamped, rewritten, or duplicated.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(JSON.stringify({
    ok: false,
    retired: true,
    reason: "pdf_verification_stamping_retired",
    error: "Verification IDs are available in the customer portal; letters are delivered without embedded IDs or QR codes.",
  }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

