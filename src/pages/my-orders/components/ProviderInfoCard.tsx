// ProviderInfoCard — customer-facing "Assigned Provider" profile.
// CUSTOMER-PORTAL-PROVIDER-PROFILE-ACCOUNT-HUB-FINAL-REDESIGN-001.
//
// Assignment is detected from the order's own `doctor_user_id`/`doctor_name`
// (already customer-readable) — so an assigned provider shows immediately, fixing
// the prior bug where the card keyed off the (usually blank) `selected_provider`.
// Rich, SAFE profile fields (title, license #, licensed states, bio, photo) are
// fetched through the ownership-scoped `get-customer-order-provider` edge function
// — the customer never reads doctor_profiles directly. Provider trust blue is used
// ONLY on this card. Compliance: "assigned for review", never "approved/guaranteed".

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import CustomerPortalSection from "./CustomerPortalSection";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "Washington DC", FL: "Florida", GA: "Georgia", HI: "Hawaii",
  ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export interface ProviderCardOrder {
  id: string;
  confirmation_id: string;
  status: string;
  state?: string | null;
  letter_type?: string | null;
  doctor_status?: string | null;
  doctor_user_id?: string | null;
  doctor_name?: string | null;
}

interface ProviderProfile {
  name: string | null;
  title: string | null;
  licenseNumber: string | null;
  licensedStates: string[];
  bio: string | null;
  photoUrl: string | null;
}

function isPSD(order: ProviderCardOrder): boolean {
  return order.letter_type === "psd" || (order.confirmation_id?.includes("-PSD") ?? false);
}

export default function ProviderInfoCard({ order }: { order: ProviderCardOrder }) {
  const assigned = !!order.doctor_user_id || !!(order.doctor_name && order.doctor_name.trim());
  const [profile, setProfile] = useState<ProviderProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!assigned) { setProfile(null); return; }
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${SUPABASE_URL}/functions/v1/get-customer-order-provider`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ orderId: order.id }),
        });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && data?.ok && data.provider) setProfile(data.provider as ProviderProfile);
      } catch { /* fail soft — name still shows from doctor_name */ }
    })();
    return () => { cancelled = true; };
  }, [order.id, assigned]);

  // Hide for unpaid / cancelled / refunded — provider assignment isn't relevant.
  if (order.status === "lead" || order.status === "cancelled" || order.status === "refunded") return null;

  const ds = order.doctor_status ?? "";
  const kind = isPSD(order) ? "healthcare" : "mental health";
  const name = (profile?.name ?? order.doctor_name ?? "").trim();

  // Status chip — semantic colors only (green=completed, blue=reviewing, neutral=assigned, amber=pending).
  let chip: { label: string; cls: string; icon: string };
  let line: string;
  if (!assigned) {
    chip = { label: "Assignment in progress", cls: "bg-[#FFFBEB] text-[#B45309]", icon: "ri-loader-4-line" };
    line = `A licensed ${kind} provider is being assigned to your case. Their details will appear here once assigned — you'll also get an email.`;
  } else if (ds === "patient_notified") {
    chip = { label: "Review completed", cls: "bg-[#ECFDF5] text-[#059669]", icon: "ri-checkbox-circle-fill" };
    line = "Your licensed provider has completed their review of your case.";
  } else if (ds === "in_review" || ds === "approved" || ds === "letter_sent" || ds === "thirty_day_reissue") {
    chip = { label: "Reviewing your case", cls: "bg-[#EFF6FF] text-[#2563EB]", icon: "ri-stethoscope-line" };
    line = "Your case is assigned to this licensed provider and is actively being reviewed.";
  } else {
    chip = { label: "Assigned", cls: "bg-[#EAF2F8] text-[#2F5B86]", icon: "ri-user-received-line" };
    line = "Your case is assigned to this licensed provider for review.";
  }

  const initials = name
    ? name.replace(/^dr\.?\s+/i, "").split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "";

  const orderState = (order.state ?? "").toUpperCase();
  const stateMatch = !!profile && orderState.length === 2 && profile.licensedStates.includes(orderState);

  return (
    <CustomerPortalSection
      title="Your Provider"
      icon="ri-shield-user-line"
      tone="blue"
      headerRight={
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${chip.cls}`}>
          <i className={`${chip.icon} ${chip.icon === "ri-loader-4-line" ? "animate-spin" : ""}`}></i>{chip.label}
        </span>
      }
    >
      <div>
        {!assigned ? (
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 flex items-center justify-center rounded-2xl bg-[#EAF2F8] text-[#2F5B86] flex-shrink-0">
              <i className="ri-user-search-line text-xl"></i>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#5F6B7A]">Provider being assigned…</p>
              <p className="text-xs text-[#5F6B7A] leading-relaxed mt-0.5">{line}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-4">
            {/* photo or monogram — provider blue */}
            <div className="relative flex-shrink-0">
              {profile?.photoUrl ? (
                <img src={profile.photoUrl} alt={name || "Provider"} className="w-16 h-16 rounded-2xl object-cover" />
              ) : (
                <div className="w-16 h-16 flex items-center justify-center rounded-2xl text-white text-xl font-extrabold"
                  style={{ background: "linear-gradient(135deg,#2F5B86,#234868)" }}>
                  {initials || <i className="ri-user-line"></i>}
                </div>
              )}
              <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-[#059669] border-2 border-white flex items-center justify-center text-white text-[10px]">
                <i className="ri-check-line"></i>
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-base font-extrabold text-[#172033] leading-tight">{name || "Your licensed provider"}</p>
              {profile?.title && <p className="text-[13px] font-semibold text-[#2F5B86] mt-0.5">{profile.title}</p>}

              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                {profile?.licenseNumber && (
                  <span className="text-xs text-[#5F6B7A]">License <b className="font-mono text-[#172033]">{profile.licenseNumber}</b></span>
                )}
                {stateMatch && (
                  <span className="text-xs text-[#059669] font-semibold inline-flex items-center gap-1">
                    <i className="ri-map-pin-line"></i>Licensed in {STATE_NAMES[orderState] ?? orderState} · matches your state
                  </span>
                )}
                {!stateMatch && orderState && profile && profile.licensedStates.length > 0 && (
                  <span className="text-xs text-[#5F6B7A] inline-flex items-center gap-1">
                    <i className="ri-map-pin-line"></i>Licensed in {profile.licensedStates.length} states
                  </span>
                )}
              </div>

              <p className="text-xs text-[#5F6B7A] leading-relaxed mt-2.5 pt-2.5 border-t border-[#e2e8f0]">{line}</p>
            </div>
          </div>
        )}
      </div>
    </CustomerPortalSection>
  );
}
