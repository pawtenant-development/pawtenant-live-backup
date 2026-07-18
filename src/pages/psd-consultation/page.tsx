/**
 * /psd-consultation — RETIRED 2026-07.
 *
 * The $79 PSD consultation is no longer sold (CHECKOUT-PRICING-PHASED-
 * SUBSCRIPTION-003, Phase 9). This route now redirects to the PSD letter
 * pricing page. Historical consultation orders, invoices, and Stripe
 * Product/Price objects are preserved and unaffected — only the new-purchase
 * path is removed. The server (create-payment-intent) also hard-rejects any
 * letterType "psd-consultation" charge, so this page can never mint one.
 */
import { Navigate } from "react-router-dom";

export default function PsdConsultationRetired() {
  return <Navigate to="/psd-letter-cost" replace />;
}
