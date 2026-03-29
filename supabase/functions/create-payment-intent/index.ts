import Stripe from "https://esm.sh/stripe@14.21.0?target=deno&no-check";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COMPANY_NAME = "PawTenant";
const COMPANY_DOMAIN = "pawtenant.com";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const ADMIN_NOTIFY_EMAIL = "eservices.dm@gmail.com";
const FROM_ADDRESS = `${COMPANY_NAME} <${SUPPORT_EMAIL}>`;
const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";

// ── ESA LIVE Stripe Price ID Map ───────────────────────────────────────────
const ONE_TIME_PRICE_IDS: Record<string, Record<string, string>> = {
  "1": {
    standard: "price_1TF1aRGwm9wIWlgiUh5D4hlk",
    priority: "price_1TF1aRGwm9wIWlgidsNUQWOh",
  },
  "2": {
    standard: "price_1TF1aRGwm9wIWlgi75IgoDD2",
    priority: "price_1TF1aRGwm9wIWlgiYbOUIUUJ",
  },
  "3+": {
    standard: "price_1TF1aRGwm9wIWlgiKV1lvAxg",
    priority: "price_1TF1aRGwm9wIWlgi7VecucGQ",
  },
};

const RENEWAL_PRICE_ID        = "price_1TF1a9Gwm9wIWlgig0i7gdKz";
const ADDITIONAL_DOC_PRICE_ID = "price_1TF1a6Gwm9wIWlgiJ8DKlLy3";
const ADDITIONAL_DOC_UNIT_AMOUNT = 3000;

const ESA_SUBSCRIPTION_AMOUNTS: Record<string, number> = {
  "1":  9900,
  "2":  10900,
  "3+": 12900,
};

const PSD_PRICE_IDS: Record<string, Record<string, string>> = {
  "1":  { standard: "price_1TFkAQGwm9wIWlgiMokTLkBQ", priority: "price_1TG6ZMGwm9wIWlgibs4wx4ER" },
  "2":  { standard: "price_1TG6XWGwm9wIWlgiiNBWaSl6", priority: "price_1TG6a0Gwm9wIWlgiX0QMNBqL" },
  "3+": { standard: "price_1TG6XnGwm9wIWlgips9dkLt3", priority: "price_1TG6aPGwm9wIWlgiWMFQ0mVO" },
};

const PSD_SUBSCRIPTION_PRICE_IDS: Record<string, string> = {
  "1":  "price_1TFkDaGwm9wIWlgisHcWoZfX",
  "2":  "price_1TG6RrGwm9wIWlgiRSRzWkOb",
  "3+": "price_1TG6TKGwm9wIWlgiNFZbRloA",
};

const ADDON_PRICES: Record<string, number> = {
  zoom_call:       4000,
  physical_mail:   5000,
  landlord_letter: 3000,
};

const PSD_PRICE_AMOUNTS: Record<string, Record<string, number>> = {
  "1":   { standard: 10000, priority: 12000 },
  "2":   { standard: 12000, priority: 14000 },
  "3+":  { standard: 13500, priority: 15500 },
};

function getPetTier(count: number): string {
  if (count >= 3) return "3+";
  return String(Math.max(1, count));
}

function getSpeedKey(deliverySpeed: string): string {
  return deliverySpeed === "2-3days" ? "standard" : "priority";
}

function selectPriceId(plan: string, petCount: number, deliverySpeed: string, letterType: string): string | null {
  if (letterType === "psd") {
    const tier = getPetTier(petCount);
    if (plan === "subscription") {
      return PSD_SUBSCRIPTION_PRICE_IDS[tier] ?? PSD_SUBSCRIPTION_PRICE_IDS["1"];
    }
    const speed = getSpeedKey(deliverySpeed);
    return PSD_PRICE_IDS[tier]?.[speed] ?? PSD_PRICE_IDS["1"]["priority"];
  }
  if (plan !== "subscription") {
    const tier = getPetTier(petCount);
    const speed = getSpeedKey(deliverySpeed);
    return ONE_TIME_PRICE_IDS[tier]?.[speed] ?? ONE_TIME_PRICE_IDS["1"]["priority"];
  }
  return null;
}

function getPSDBasePriceCents(petCount: number, deliverySpeed: string): number {
  const tier = getPetTier(petCount);
  const speed = getSpeedKey(deliverySpeed);
  return PSD_PRICE_AMOUNTS[tier]?.[speed] ?? 12000;
}

function getESASubAmountCents(petCount: number): number {
  const tier = getPetTier(petCount);
  return ESA_SUBSCRIPTION_AMOUNTS[tier] ?? 9900;
}

async function cancelSubscriptionSafe(stripe: Stripe, subscriptionId: string): Promise<void> {
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    if (sub.status === "incomplete" || sub.status === "incomplete_expired") {
      await stripe.subscriptions.cancel(subscriptionId);
      console.log(`[cleanup] Cancelled incomplete subscription ${subscriptionId}`);
    }
  } catch {
    // Already cancelled or not found — ignore
  }
}

// ── Admin lead notification via Resend (fire and forget) ──────────────────
function escapeHtml(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildAdminLeadEmail(opts: {
  firstName: string; lastName: string; email: string; phone: string;
  state: string; plan: string; deliverySpeed: string; petCount: number;
  estimatedTotal: number; letterType: string;
}) {
  const deliveryLabel = opts.deliverySpeed === "priority" ? "Priority (24h)" : "Standard (2-3 days)";
  const planLabel = opts.plan === "subscription" ? "Annual Subscription" : "One-Time Purchase";
  const letterLabel = opts.letterType === "psd" ? "PSD Letter" : "ESA Letter";
  const timestamp = new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });

  function adminRow(label: string, value: string) {
    return `<tr><td style="padding:7px 0;color:#6B7280;font-size:13px;width:140px;vertical-align:top;">${label}</td><td style="padding:7px 0;font-size:14px;font-weight:600;color:#111827;">${escapeHtml(value)}</td></tr>`;
  }

  const detailRows = adminRow("Letter Type", letterLabel) +
    adminRow("Plan", planLabel) +
    adminRow("Delivery", deliveryLabel) +
    adminRow("State", opts.state || "—") +
    adminRow("Pets", String(opts.petCount)) +
    adminRow("Est. Total", `$${(opts.estimatedTotal / 100).toFixed(2)}`) +
    adminRow("Time", timestamp + " ET");

  const customerRows = adminRow("Name", `${opts.firstName} ${opts.lastName}`.trim() || "—") +
    adminRow("Email", opts.email || "—") +
    adminRow("Phone", opts.phone || "—");

  return `<!DOCTYPE html><html><body style="margin:0;background:#F3F4F6;font-family:Arial;">
    <table width="100%" style="padding:24px;"><tr><td align="center">
    <table width="660" style="background:#fff;border-radius:20px;border:1px solid #E5E7EB;overflow:hidden;">
      <tr><td style="padding:24px 30px;background:#1F2937;text-align:center;border-bottom:1px solid #374151;">
        <img src="${LOGO_URL}" width="170" style="margin-bottom:14px;" alt="${COMPANY_NAME}" />
        <div style="background:#F59E0B;color:#fff;padding:5px 14px;border-radius:999px;font-size:12px;font-weight:bold;display:inline-block;letter-spacing:0.5px;">NEW UNPAID LEAD</div>
        <h2 style="margin:14px 0 4px;color:#F9FAFB;">Lead Started Checkout</h2>
        <p style="color:#9CA3AF;margin:0;">${escapeHtml(opts.firstName || opts.email)} is at the payment step — not paid yet</p>
      </td></tr>
      <tr><td style="padding:28px 30px;">
        <p style="color:#374151;margin-bottom:20px;">A new lead has reached the payment step. They have <strong>NOT paid yet</strong>. If they don\'t convert, consider a follow-up.</p>
        <div style="background:#FAFAFA;border:1px solid #E5E7EB;border-left:4px solid #F59E0B;border-radius:10px;padding:18px 20px;margin-bottom:16px;">
          <p style="color:#FF6A00;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;">Lead Details</p>
          <table style="width:100%;border-collapse:collapse;">${detailRows}</table>
        </div>
        <div style="background:#FAFAFA;border:1px solid #E5E7EB;border-left:4px solid #3B82F6;border-radius:10px;padding:18px 20px;margin-bottom:16px;">
          <p style="color:#FF6A00;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px 0;">Customer Info</p>
          <table style="width:100%;border-collapse:collapse;">${customerRows}</table>
        </div>
        <div style="text-align:center;margin:24px 0;">
          <a href="https://${COMPANY_DOMAIN}/admin" style="background:#FF6A00;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">Open Admin Panel &rarr;</a>
        </div>
      </td></tr>
      <tr><td style="padding:16px 30px;background:#F9FAFB;text-align:center;border-top:1px solid #E5E7EB;">
        <p style="font-size:12px;color:#9CA3AF;margin:0;">Admin notification from ${COMPANY_NAME} &bull; <a href="https://${COMPANY_DOMAIN}/admin" style="color:#FF6A00;">Open Admin Panel</a></p>
      </td></tr>
    </table>
    </td></tr></table>
  </body></html>`;
}

/** Send admin lead notification via Resend — fire and forget, never throws */
function notifyAdminNewLead(opts: {
  firstName: string; lastName: string; email: string; phone: string;
  state: string; plan: string; deliverySpeed: string; petCount: number;
  estimatedTotal: number; letterType: string;
}): void {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return;

  const html = buildAdminLeadEmail(opts);
  const name = opts.firstName || opts.email || "Unknown";

  fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [ADMIN_NOTIFY_EMAIL],
      subject: `New Lead — ${name} ($${(opts.estimatedTotal / 100).toFixed(2)} ${opts.letterType.toUpperCase()})`,
      html,
    }),
  }).then((res) => {
    console.log(`[PI] Admin lead notification: HTTP ${res.status}`);
  }).catch((err) => {
    console.warn("[PI] Admin lead notification failed:", String(err));
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured.");
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const body = await req.json();

    // ── Cancel-only action (called on component unmount / plan change) ──────
    if (body.action === "cancel_subscription" && body.cancelSubscriptionId) {
      await cancelSubscriptionSafe(stripe, body.cancelSubscriptionId as string);
      return new Response(
        JSON.stringify({ cancelled: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    const {
      plan,
      petCount = 1,
      deliverySpeed = "priority",
      email,
      customerName,
      metadata,
      additionalDocCount = 0,
      couponCode = null,
      couponDiscount = null,
      addonServices = [],
      letterType = "esa",
      cancelSubscriptionId = null,
    } = body;

    // Cancel the previous incomplete subscription before creating a new one
    if (cancelSubscriptionId) {
      await cancelSubscriptionSafe(stripe, cancelSubscriptionId as string);
    }

    const parsedPetCount = Math.max(1, Number(petCount));
    const parsedAdditionalDocCount = Math.max(0, parseInt(String(additionalDocCount), 10) || 0);
    const additionalDocFee = parsedAdditionalDocCount * ADDITIONAL_DOC_UNIT_AMOUNT;

    const parsedAddonServices: string[] = Array.isArray(addonServices) ? addonServices : [];
    const addonFee = parsedAddonServices.reduce((sum, id) => sum + (ADDON_PRICES[id] ?? 0), 0);

    const couponDiscountCents = couponDiscount != null
      ? Math.max(0, Math.round(parseFloat(String(couponDiscount)) * 100))
      : 0;

    const isESASubscription = letterType === "esa" && plan === "subscription";

    let basePriceAmount: number;
    let priceId: string | null = null;

    if (isESASubscription) {
      basePriceAmount = getESASubAmountCents(parsedPetCount);
    } else {
      priceId = selectPriceId(plan, parsedPetCount, deliverySpeed, letterType);
      if (!priceId) throw new Error("Unable to resolve Stripe Price ID.");

      const stripePrice = await stripe.prices.retrieve(priceId);
      if (letterType === "psd" && plan !== "subscription") {
        basePriceAmount = getPSDBasePriceCents(parsedPetCount, deliverySpeed);
      } else {
        basePriceAmount = stripePrice.unit_amount ?? 9900;
      }
    }

    const mergedMeta: Record<string, string> = {
      ...(metadata ?? {}),
      ...(priceId ? { priceId } : {}),
      letterType: letterType ?? "esa",
      additionalDocCount: String(parsedAdditionalDocCount),
      addonServices: JSON.stringify(parsedAddonServices),
      petCount: String(parsedPetCount),
    };
    if (couponCode) mergedMeta.couponCode = String(couponCode);
    if (couponDiscount != null) mergedMeta.couponDiscount = String(couponDiscount);

    let clientSecret: string;
    let totalAmount: number;
    let subscriptionId: string | undefined;

    if (plan === "subscription") {
      const customer = await stripe.customers.create({ email, name: customerName });

      if (parsedAdditionalDocCount > 0) {
        await stripe.invoiceItems.create({
          customer: customer.id,
          amount: additionalDocFee,
          currency: "usd",
          description: `Additional Documentation Fee (${parsedAdditionalDocCount} document${parsedAdditionalDocCount > 1 ? "s" : ""})`,
          metadata: { priceId: ADDITIONAL_DOC_PRICE_ID, docCount: String(parsedAdditionalDocCount) },
        });
      }

      if (addonFee > 0) {
        await stripe.invoiceItems.create({
          customer: customer.id,
          amount: addonFee,
          currency: "usd",
          description: `Add-on Services: ${parsedAddonServices.join(", ")}`,
          metadata: { addonServices: JSON.stringify(parsedAddonServices) },
        });
      }

      if (couponDiscountCents > 0) {
        await stripe.invoiceItems.create({
          customer: customer.id,
          amount: -couponDiscountCents,
          currency: "usd",
          description: `Coupon Discount${couponCode ? ` (${couponCode})` : ""}`,
          metadata: { couponCode: couponCode ?? "", couponDiscount: String(couponDiscount) },
        });
      }

      let subscriptionItems: Stripe.SubscriptionCreateParams["items"];

      if (isESASubscription) {
        const renewalPriceObj = await stripe.prices.retrieve(RENEWAL_PRICE_ID);
        const productId = renewalPriceObj.product as string;

        const tier = getPetTier(parsedPetCount);
        console.log(`[ESA Subscription] petCount=${parsedPetCount} tier=${tier} amount=${basePriceAmount} productId=${productId}`);

        subscriptionItems = [
          {
            price_data: {
              currency: "usd",
              unit_amount: basePriceAmount,
              recurring: { interval: "year" },
              product: productId,
            },
          },
        ];
      } else {
        subscriptionItems = [{ price: priceId as string }];
      }

      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: subscriptionItems,
        payment_behavior: "default_incomplete",
        payment_settings: {
          save_default_payment_method: "on_subscription",
          payment_method_types: ["card"],
        },
        expand: ["latest_invoice.payment_intent"],
        metadata: mergedMeta,
      });

      const invoice = subscription.latest_invoice as Stripe.Invoice;
      const pi = invoice.payment_intent as Stripe.PaymentIntent;
      clientSecret = pi.client_secret!;
      subscriptionId = subscription.id;

      totalAmount = invoice.amount_due ?? invoice.total ?? (basePriceAmount + additionalDocFee + addonFee - couponDiscountCents);
      totalAmount = Math.max(50, totalAmount);

      if (pi.id && metadata?.confirmationId) {
        await stripe.paymentIntents.update(pi.id, { metadata: mergedMeta });
      }
    } else {
      // One-time payment
      totalAmount = Math.max(50, basePriceAmount + additionalDocFee + addonFee - couponDiscountCents);

      const pi = await stripe.paymentIntents.create({
        amount: totalAmount,
        currency: "usd",
        receipt_email: email,
        automatic_payment_methods: { enabled: true },
        metadata: mergedMeta,
      });
      clientSecret = pi.client_secret!;
    }

    // ── Fire admin lead notification (fire and forget — never blocks response) ──
    if (email) {
      notifyAdminNewLead({
        firstName: (metadata?.firstName as string) ?? "",
        lastName: (metadata?.lastName as string) ?? "",
        email: email as string,
        phone: (metadata?.phone as string) ?? "",
        state: (metadata?.state as string) ?? "",
        plan: plan as string,
        deliverySpeed: deliverySpeed as string,
        petCount: parsedPetCount,
        estimatedTotal: totalAmount,
        letterType: letterType as string,
      });
    }

    return new Response(
      JSON.stringify({
        clientSecret,
        amount: totalAmount,
        basePriceAmount,
        priceId,
        subscriptionId,
        additionalDocFee,
        addonFee,
        couponDiscountCents,
        letterType,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
