// Shared renderer for the order_confirmation email body. Used by both
// resend-confirmation-email (automatic webhook + client_fallback) and
// send-templated-email (admin Comms manual) so customers see one polished,
// identical email regardless of which path triggered the send.
//
// The DB template body is treated as paragraph copy (greeting, intro, "what
// happens next", closing). The structured order details card is injected
// programmatically by this module — so the email looks consistent even if
// an admin edits the body and forgets a placeholder. The [ORDER_DETAILS]
// marker in the body controls placement; if missing, the card falls through
// to the end (before the CTA) as a graceful default.

export function escapeHtml(v = ""): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface OrderDetailsCardOpts {
  orderId: string;
  state?: string | null;
  plan?: string | null;
  delivery?: string | null;
  amount?: string | null;
  couponCode?: string | null;
  couponDiscount?: number | null;
  receiptUrl?: string | null;
}

const ACCENT = "#1a5c4f";

export function buildOrderDetailsCard(opts: OrderDetailsCardOpts): string {
  const rows: Array<[string, string, string?]> = [
    ["Order ID", escapeHtml(opts.orderId), ACCENT],
  ];
  if (opts.state)    rows.push(["State", escapeHtml(opts.state)]);
  if (opts.plan)     rows.push(["Plan", escapeHtml(opts.plan)]);
  if (opts.delivery) rows.push(["Delivery", escapeHtml(opts.delivery)]);
  if (opts.amount)   rows.push(["Amount Paid", escapeHtml(opts.amount)]);
  if (opts.couponCode) {
    const discount = opts.couponDiscount ? ` (-$${opts.couponDiscount}.00 saved)` : "";
    rows.push(["Coupon", `${escapeHtml(opts.couponCode)}${discount}`]);
  }
  if (opts.receiptUrl) {
    rows.push([
      "Receipt",
      `<a href="${escapeHtml(opts.receiptUrl)}" style="color:${ACCENT};text-decoration:none;font-weight:700;">View Payment Receipt &rarr;</a>`,
    ]);
  }

  const lastIdx = rows.length - 1;
  const rowsHtml = rows
    .map(([label, value, color], i) => {
      const border = i === lastIdx ? "" : "border-bottom:1px solid #d8ebe6;";
      return `
    <tr>
      <td style="padding:10px 0;font-size:13px;color:#4b6661;width:42%;vertical-align:top;${border}">${label}</td>
      <td style="padding:10px 0;font-size:14px;font-weight:700;color:${color ?? "#1a2e2a"};text-align:right;vertical-align:top;${border}">${value}</td>
    </tr>`;
    })
    .join("");

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf7;border:1px solid #b8ddd5;border-radius:12px;margin:6px 0 26px 0;border-collapse:separate;">
  <tr><td style="padding:18px 22px;">
    <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;color:#4b6661;text-transform:uppercase;letter-spacing:0.08em;">Order Details</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${rowsHtml}
    </table>
  </td></tr>
</table>`;
}

const PARA_STYLE = "margin:0 0 16px 0;line-height:1.65;color:#374151;font-size:15px;";

// Splits body on \n\n (paragraph break). \n inside a paragraph becomes <br/>.
// A paragraph that equals "[ORDER_DETAILS]" is replaced by the details card.
// If the marker is absent, the card is appended once at the end so admin
// edits to the body never silently drop the order details.
function renderParagraphsWithCard(bodyText: string, detailsCard: string): string {
  const paragraphs = bodyText
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  let cardEmitted = false;
  const out: string[] = [];
  for (const p of paragraphs) {
    if (p === "[ORDER_DETAILS]") {
      if (!cardEmitted) { out.push(detailsCard); cardEmitted = true; }
      continue;
    }
    out.push(`<p style="${PARA_STYLE}">${p.replace(/\n/g, "<br/>")}</p>`);
  }
  if (!cardEmitted) out.push(detailsCard);
  return out.join("");
}

export interface OrderConfirmationContentOpts {
  subject?: string | null;
  bodyText: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  details: OrderDetailsCardOpts;
}

export function renderOrderConfirmationContent(opts: OrderConfirmationContentOpts): string {
  const heading = opts.subject
    ? `<h1 style="margin:0 0 22px 0;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">${escapeHtml(opts.subject)}</h1>`
    : "";
  const card = buildOrderDetailsCard(opts.details);
  const paras = renderParagraphsWithCard(opts.bodyText, card);
  const cta = (opts.ctaLabel && opts.ctaUrl)
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 0 0;">
         <tr><td align="center">
           <a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;background:#1a5c4f;color:#ffffff;font-weight:700;font-size:15px;padding:14px 36px;border-radius:10px;text-decoration:none;">${escapeHtml(opts.ctaLabel)} &rarr;</a>
         </td></tr>
       </table>`
    : "";
  return `${heading}${paras}${cta}`;
}
