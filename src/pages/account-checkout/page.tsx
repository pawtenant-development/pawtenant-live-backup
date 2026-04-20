import { useEffect, useState } from "react";
import { Navigate, useSearchParams, Link } from "react-router-dom";

/**
 * /account/checkout?cid=<confirmationId>
 *
 * Returning-customer checkout entry point used by the admin OrderDetailModal
 * and the customer portal ("Upgrade to Subscription" / "Buy Another ESA"
 * buttons). The row is created upstream by the create-returning-order edge
 * function; here we just verify the row exists and then delegate to the
 * existing resume flow (/assessment?resume=<cid>) so Step3Checkout and all of
 * its payment wiring can be reused without duplication.
 *
 * The public /assessment strict-paid-email block does NOT apply to the
 * resume path — it checks Step 2 → Step 3 progression only. Resumed rows
 * with parent_order_id are authorized by the server-side Stripe bypass.
 */
export default function AccountCheckoutPage() {
  const [params] = useSearchParams();
  const cid = params.get("cid")?.trim() ?? "";
  const [status, setStatus] = useState<"checking" | "ok" | "missing" | "already_paid">(
    cid ? "checking" : "missing",
  );

  useEffect(() => {
    if (!cid) return;
    const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
    const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/get-resume-order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ confirmationId: cid }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          order?: { already_paid?: boolean };
        };
        if (cancelled) return;
        if (!json.ok || !json.order) setStatus("missing");
        else if (json.order.already_paid) setStatus("already_paid");
        else setStatus("ok");
      } catch {
        if (!cancelled) setStatus("missing");
      }
    })();
    return () => { cancelled = true; };
  }, [cid]);

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-orange-50">
        <i className="ri-loader-4-line animate-spin text-3xl text-orange-500"></i>
      </div>
    );
  }

  if (status === "ok") {
    // Reuse the existing resume flow: hydrates step1/step2, jumps to Step 3,
    // mints a PI with the new confirmationId. The server-side bypass kicks in
    // because the row has parent_order_id set.
    return <Navigate to={`/assessment?resume=${encodeURIComponent(cid)}`} replace />;
  }

  if (status === "already_paid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-orange-50 px-4">
        <div className="max-w-md text-center bg-white rounded-2xl border border-gray-100 p-8">
          <i className="ri-checkbox-circle-line text-4xl text-green-500 mb-3"></i>
          <h1 className="text-xl font-extrabold text-gray-900 mb-1">Already paid</h1>
          <p className="text-sm text-gray-500 mb-5">This order has already been completed.</p>
          <Link
            to="/my-orders"
            className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors"
          >
            View my orders
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-orange-50 px-4">
      <div className="max-w-md text-center bg-white rounded-2xl border border-gray-100 p-8">
        <i className="ri-error-warning-line text-4xl text-red-500 mb-3"></i>
        <h1 className="text-xl font-extrabold text-gray-900 mb-1">Checkout link invalid</h1>
        <p className="text-sm text-gray-500 mb-5">
          This checkout session could not be found. Please request a new link from the portal.
        </p>
        <Link
          to="/my-orders"
          className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors"
        >
          Back to my orders
        </Link>
      </div>
    </div>
  );
}
